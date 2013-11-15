/*
You should pass in the following parameters:
{
   gameid: gameid
   socket: A socket that we can use
   connected_callback: A callback for use when we have successfully connected
   disconnected_callback: For when we disconnect
   deselect_all_callback: Deselects all cards
   replace_callback: function({idx: {new_card: new_card, reason: reason})
   playerlist_callback: function(new_playerlist, requesters)
   numcards_callback: function(numcards)   (we call this with -1 if game is over)
   time_callback: function(time)
   noset_declaration_callback
   gametype_callback
   settings_callback(settings)
   game_par_callback(par)
}

We provide the following functions:
   connect: start everything up
   select_card(card): call me whenever the user selects a card
   delelect_card(card): obvious
*/

function controller(par)
{
   /*** BEGIN LATENCY FUNCTIONS ***/
   var receivedping = true;
   var ping_time = 0;
   var delta_us_server = 0;
   var delta_us_server_valid = false;
   function setup_timeping()
   {
      par.socket.on('timeping', function(msg)
      {
         receivedping = true;
         par.socket.emit('timeping', msg);
         ping_time = msg.ping_time;
         delta_us_server = (msg.timestamp+0.5*msg.ping_time)-Date.now();
         delta_us_server_valid = true;
      });
      setInterval(function()
      {
         if(!receivedping)
         {
            par.disconnected_callback('Ping timeout');
         }
         receivedping = false;
      }, 3000);
   }

   /*** BEGIN TIMING FUNCTIONS ***/
   var game_start_timestamp = undefined;
   var game_end_timestamp = undefined;
   var last_callback_time = 0;
   var time_callback_timeout = null;
   var settings = null;
   function reset_time_callback()
   {
      last_callback_time = -1;
      par.time_callback(-1);
      do_time_callback();
   }
   function do_time_callback()
   {
      if(time_callback_timeout !== null)
      {
         clearInterval(time_callback_timeout);
         time_callback_timeout = null;
      }

      if(!delta_us_server_valid)
      {
         time_callback_timeout = setTimeout(do_time_callback, 1000);
         return;
      }

      if(game_start_timestamp === undefined)
      {
         par.time_callback(-1);
      }
      else
      {
         var server_time_now = Date.now() + delta_us_server;
         var game_time_now = server_time_now-game_start_timestamp;
         var game_seconds = Math.floor(game_time_now/1000);
         var ms_to_next_second = (game_seconds+1)*1000-game_time_now;
         setTimeout(do_time_callback, ms_to_next_second);
         if(game_end_timestamp === undefined)
         {
            par.time_callback(game_seconds);
         }
         else
         {
            par.time_callback(Math.floor((game_end_timestamp-game_start_timestamp)/1000));
         }
      }
   }

   /*** BEGIN UTILITY FUNCTIONS ***/
   /* Return true if a and b are the same card, false otherwise */
   var cards_equal = function(a, b)
   {
      for(var i = 0; i < 4; i++)
      {
         if(a[i] != b[i])
         {
            return false;
         }
      }
      return true;
   };

   /*** BEGIN CONTROLLING FUNCTIONS ***/
   var selected_cards = [];

   function send_selection()
   {
      if(selected_cards.length > 3)
      {
         console.log("This should never happen!");
         selected_cards = [];
         par.deselect_all_callback();
      }

      if(selected_cards.length == 3)
      {
         var action =
         {
            action_type: 'pickup',
            cards: selected_cards
         };
         par.socket.emit('message', action);
         selected_cards = [];
         par.deselect_all_callback();
      }
   }

   /*** BEGIN FUNCTIONS WHO MANAGE UPDATES ***/
   var table = [];
   var players = {};
   var noset_declarers = [];

   function exec_complete_update(update)
   {
      /* Update game state */
      table = update.table;
      players = update.players;
      noset_declarers = update.noset_declarers;
      selected_cards = [];
      game_start_timestamp = update.game_start_timestamp;
      reset_time_callback();

      /* Tell interface about it */
      par.deselect_all_callback();
      var replacement = {};
      for(var i = 0; i < table.length; i++)
      {
         replacement[i] =
         {
            new_card: table[i],
            reason: 'complete-update'
         };
      }
      for(var i = table.length; i < 21; i++)
      {
         replacement[i] =
         {
            new_card: 0,
            reason: 'complete-update'
         };
      }
      par.replace_callback(replacement);
      par.playerlist_callback(players, noset_declarers);
      par.game_par_callback(update.game_par);

      if(update.hasOwnProperty('game_has_ended'))
      {
         if(game_end_timestamp === undefined)
            game_end_timestamp = update.timestamp;
         if(update.hasOwnProperty('no_more_starts'))
            par.numcards_callback(-2);
         else
            par.numcards_callback(-1);
      }
      else
      {
         game_end_timestamp = undefined;
         par.numcards_callback(update.cards_left);
      }
   }

   function exec_step_update(update)
   {
      /* Remove cards to be removed */
      var replacement = {};
      var rm = update.cards_removed;
      var rmer = update.card_remover;
      var add = update.cards_added;
      if(rm === undefined)
         rm = [];
      if(rmer === undefined)
         rmer = [];
      if(add === undefined)
         add = [];
      var holes = [];
      for(var i = 0; i < rm.length; i++)
      {
         for(var j = 0; j < table.length; j++)
         {
            if(cards_equal(rm[i], table[j]))
            {
               break;
            }
         }
         table[j] = 0;
         replacement[j] =
         {
            new_card: 0,
            reason: 'removed',
            remover: rmer[i]
         };
         holes.push(j);

         if(!settings || (settings && settings.deselection_behavior === '0')) {
            // Only deselect the selected cards that
            // intersect with the taken cards.
            for(var j = 0; j < selected_cards.length; j++)
            {
               if(cards_equal(rm[i], selected_cards[j]))
               {
                  selected_cards.splice(j,1);
               }
            }
         } else {
            // Deselect all the cards if there is
            // a nonempty intersection between
            // selected cards and taken cards
            for(var j = 0; j < selected_cards.length; j++) {
               if(cards_equal(rm[i], selected_cards[j])) {
                  selected_cards = [];
                  par.deselect_all_callback();
                  break;
               }
            }
         }
      }

      /* Now we need to fill the holes */
      holes.sort(function(a,b) { return a-b; });
      for(var i = 0; i < holes.length; i++)
      {
         var holeidx = holes[i];

         if(add.length > 0)
         {
            /* First place to look for a filler is in added cards */
            table[holeidx] = add.pop();
            replacement[holeidx].new_card = table[holeidx];
         }
         else
         {
            /* Next place to look is at the table */
            for(var j = table.length-1; j > holeidx; j--)
            {
               if(table[j] != 0)
               {
                  table[holeidx] = table[j];
                  table[j] = 0;
                  replacement[holeidx].new_card = table[holeidx];
                  replacement[j] =
                  {
                     new_card: 0,
                     reason: 'moved'
                  };
                  break;
               }
            }
         }
      }

      /* Remove all the zeros at the end of the table */
      while(table.length > 0 && table[table.length-1]==0)
      {
         table.pop();
      }

      /* Add on cards that are left to add */
      while(add.length > 0)
      {
         var putidx = table.length;
         table[putidx] = add.pop();
         replacement[putidx] =
         {
            new_card: table[putidx],
            reason: 'added'
         };
      }

      /* Update player joins/leaves */
      var joins = update.players_joined;
      var leaves = update.players_left;
      var deltas = update.player_scoredeltas;
      if(joins === undefined)
         joins = {};
      if(leaves === undefined)
         leaves = [];
      if(deltas === undefined)
         deltas = {};
      for(p in joins)
      {
         if(joins.hasOwnProperty(p))
         {
            players[p] = joins[p];
         }
      }
      for(var i = 0; i < leaves.length; i++)
      {
         delete players[leaves[i]];
      }
      for(p in deltas)
      {
         if(deltas.hasOwnProperty(p) && players.hasOwnProperty(p))
         {
            players[p] += deltas[p];
         }
      }

      /* Update noset_declarers */
      var noset_declarers_increased = false;
      if(update.hasOwnProperty('noset_declarers'))
      {
         noset_declarers_increased = noset_declarers.length<update.noset_declarers.length;
         noset_declarers = update.noset_declarers;
      }

      /* Tell interface about it */
      par.replace_callback(replacement);
      par.playerlist_callback(players, noset_declarers);
      if(update.hasOwnProperty('game_has_ended'))
      {
         if(game_end_timestamp === undefined)
            game_end_timestamp = update.timestamp;
         if(update.hasOwnProperty('no_more_starts'))
            par.numcards_callback(-2);
         else
            par.numcards_callback(-1);
      }
      else
      {
         game_end_timestamp = undefined;
         par.numcards_callback(update.cards_left);
      }
      if(noset_declarers_increased)
      {
         par.noset_declaration_callback();
      }
      if(update.hasOwnProperty('noset_bad'))
      {
         par.noset_bad_callback();
      }
   }

   /*** END FUNCTIONS WHO MANAGE UPDATES ***/

   /*** BEGIN FUNCTIONS WHO MANAGE UPDATE QUEUE ***/
   var stateid = -2;
   var update_queue = [];

   var queue_timeout = null;
   function update_queue_timeout()
   {
      if(update_queue.length == 0)
      {
         return;
      }

      var server_time_now = Date.now()+delta_us_server;
      var t_to_update = update_queue[0].timestamp-server_time_now;
      if(queue_timeout !== null)
      {
         clearTimeout(queue_timeout);
      }
      queue_timeout = setTimeout(apply_update_queue, t_to_update);
   }

   function apply_update_queue()
   {
      var server_time_now = Date.now()+delta_us_server;
      if(!delta_us_server_valid)
      {
         return;
      }

      while(update_queue.length > 0
            && update_queue[0].timestamp <= server_time_now
            && update_queue[0].stateid <= stateid+1)
      {
         if(update_queue[0].stateid < stateid+1)
         {
            /* Throw away updates that we have alreay seen */
            update_queue.splice(0,1);
         }
         else
         {
            /* This update updates us to stateid+1, so apply it, if the time is
             * okay! */
            exec_step_update(update_queue[0]);
            stateid = update_queue[0].stateid;
            update_queue.splice(0,1);
         }
      }
      update_queue_timeout();
   }

   function rx_update(update)
   {
      if(update.update_type == 'complete-update')
      {
         exec_complete_update(update);
         stateid = update.stateid;
      }
      else
      {
         if(update.stateid > stateid+2)
         {
            /* We have probably lost an update somewhere, so request a
             * complete update */
            /* TODO: actually request the complete update */
            /* TODO: make requesting a complete update be based on how long
             * we have been waiting with a nonzero length update_queue */
            /* Note that this never seems to happen so we can probably just ignore it! */
         }

         update_queue.push(update);
         update_queue.sort(function(a,b)
         {
            return a.stateid - b.stateid;
         });
         update_queue_timeout();
      }
   }
   /*** END FUNCTIONS WHO MANAGE UPDATE QUEUE ***/

   function send_join()
   {
      par.socket.emit('message',
      {
         action_type: 'join'
      });
   }

   function socket_connect(secret, username)
   {
      par.socket.on('role', function(msg)
      {
         if(msg === true)
         {
            setup_timeping();
            send_join();
            par.connected_callback();
         }
         else
         {
            par.disconnected_callback(msg.error);
         }
      });
      par.socket.on('connect', function()
      {
         if(secret)
         {
            par.socket.emit('role', { role_type:'game', gameid: par.gameid,
            secret: secret, username: username });
         }
         else
         {
            par.socket.emit('role', { role_type:'game', gameid: par.gameid });
         }
      });
      par.socket.on('message', rx_update);
      par.socket.on('settings', par.settings_callback);
      par.socket.on('settings', function(_settings) {
         settings = _settings;
      });
   }

   var ret =
   {
      connect: function(secret, username)
      {
         socket_connect(secret, username);
      },
      select_card: function(card)
      {
         selected_cards.push(card);
         send_selection();
      },
      deselect_card: function(card)
      {
         for(var i = 0; i < selected_cards.length; i++)
         {
            if(cards_equal(card, selected_cards[i]))
            {
               selected_cards.splice(i,1);
               break;
            }
         }
      },
      declare_nosets: function()
      {
         par.socket.emit('message',
         {
            action_type: 'declare-nosets'
         });
      },
      begin_game: function()
      {
         par.socket.emit('message',
         {
            action_type: 'begin-game'
         });
      }
   };

   setInterval(apply_update_queue, 200);

   return ret;
}
