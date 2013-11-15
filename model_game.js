var db = require("mongojs").connect("set-game", ["games"]);

var model_game = function(par)
{
   var game_in_progress = false; //bool true/false
   var unused_cards = []; //The cards still in the deck
   var table = []; //The cards on the table
   
   /* playerid->score maps */
   var beginning_players = {}; // who was here when the game started
   var ever_players = {}; // who was ever in this game
   var players = {}; // who is in this game now
   var num_noset_bad = {}; //number of times people improperly request cards

   var numplayers = 0; // how many players are in this game now

   var noset_declarers = []; //list of people who have declared no sets
   var last_card_add_timestamp = 0; //last time we've added cards

   var on_vidx = 0; 
   var viewers = {}; //The viewers viewing this game
   var viewer_stateid = {}; //The stateid that the viewer currently has

   var pending_actions = []; //Actions we have received and not yet executed

   var action_history = [];
   var update_history = [];

   var stateid = 0; //keeps track of how many updates have happened

   var worst_ping = 0; //the worst ping connected to our game
   var worst_ping_future = 0; //when ppl notify us of ping, they update this var
   var worst_ping_recaculated = 0; //when we actually calculated this last

   var game_start_timestamp = undefined; //when the game has started

   var num_starts = 0;

   /*** CODE TO CHECK IF SETS EXIST ***/
   function arrtocardidx(card)
   {
      return card[0]+3*(card[1]+3*(card[2]+3*card[3]));
   }
   function add_cards(a, b)
   {
      var ret = [];
      for(var i = 0; i < 4; i++)
      {
         ret.push((2*a[i]+2*b[i])%3);
      }
      return ret;
   }
   function set_exists()
   {
      /*** TODO: Cache the results because this may be a bit compute-expensive?
       * ***/
      var have_card = {};
      for(var i = 0; i < table.length; i++)
      {
         if(table[i] != undefined && table[i] != 0)
         {
            have_card[arrtocardidx(table[i])] = true;
         }
      }

      var setfound = false;
      for(var i = 0; i < table.length; i++)
      {
         for(var j = i+1; j < table.length; j++)
         {
            if(table[i] != undefined && table[i] != 0
               && table[j] != 0 && table[j] != undefined
               && have_card[arrtocardidx(add_cards(table[i],table[j]))])
            {
               setfound = true;
               break;
            }
         }
         if(setfound)
            break;
      }

      return setfound;
   }
   /*** END CODE TO CHECK IF SETS EXIST ***/
 
   var generate_complete_update = function()
   {
      var cp_table = [];
      for(var i = 0; i < table.length; i++)
      {
         cp_table.push(table[i]);
      }
      var cp_players = {};
      for(p in players)
      {
         if(players.hasOwnProperty(p))
         {
            cp_players[p] = players[p];
         }
      }
      var cp_noset_declarers = [];
      for(var i = 0; i < noset_declarers.length; i++)
      {
         cp_noset_declarers.push(noset_declarers[i]);
      }

      var tupdate =
      {
         update_type: 'complete-update',
         players: cp_players, // playerid->score 
         table: cp_table, // array of cards
         stateid: stateid,
         cards_left: unused_cards.length,
         game_start_timestamp: game_start_timestamp,
         noset_declarers: cp_noset_declarers,
         game_par: par
      };

      if(!game_in_progress)
      {
         tupdate.game_has_ended = true;
         if(par.hasOwnProperty('max_num_starts')
               && num_starts >= par.max_num_starts)
         {
            tupdate.no_more_starts = true;
         }
      }

      return tupdate;
   }
 
   var log_update = function(update)
   {
      update_history.push(update);
   }
  
   /* Update all viewers to the current state of the game */
   /* Pass us the latest update to happen. Any viewer who is a stateid-1 will
      merely get this update. Other viewers get the entire game state. */
   var notify_viewers = function(last_update)
   {

      for(var i in viewers)
      {
         if(viewer_stateid[i] == stateid-1)
         {
            /* Merely notify about the last update */
            viewers[i].send_update(last_update);
         }
         else if(viewer_stateid[i] < stateid-1)
         {
            viewers[i].send_update(generate_complete_update());
         }
         viewer_stateid[i] = stateid;
      }
   };

   /* Get a random unused card and remove it from the set of unused cards */
   var pop_randcard = function()
   {
      if(!par.hasOwnProperty('fixed_deck'))
      {
         var randidx = Math.floor(Math.random()*unused_cards.length);
         return unused_cards.splice(randidx,1)[0];
      }
      else
      {
         return unused_cards.pop();
      }
   };

   /* Verify that this array of cards is indeed a set */
   var verify_set = function(cards)
   {
      if(cards.length!=3)
      {
         return false;
      }
      for(var i = 0; i < 3; i++)
      {
         if(cards[i].length != 4)
         {
            return false;
         }
      }

      for(var i = 0; i < 4; i++)
      {
         var sum = 0;
         for(var j = 0; j < 3; j++)
         {
            if(cards[j][i] < 0 || cards[j][i] > 2)
            {
               return false;
            }
            sum += cards[j][i];
         }
         if(sum % 3 != 0)
         {
            return false;
         }
      }

      return true;
   };

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

   /* Verify that this array of cards is indeed on the table */
   var verify_ontable = function(cards)
   {
      for(var i = 0; i < cards.length; i++)
      {
         var foundit = false;
         for(var j = 0; j < table.length; j++)
         {
            if(cards_equal(cards[i], table[j]))
            {
               foundit = true;
               break;
            }
         }
         if(!foundit)
         {
            return false;
         }
      }
      return true;
   };

   var execute_join = function(action, update)
   {
      /* TODO: maybe error check to make sure the same player doesn't join
       * twice? */

      console.log(players);
      console.log(beginning_players);
      console.log(ever_players);

      if(players.hasOwnProperty(action.playerid))
      {
         return;
      }

      if(ever_players.hasOwnProperty(action.playerid))
      {
         players[action.playerid] = ever_players[action.playerid];
      }
      else
      {
         players[action.playerid] = 0;
      }
      ever_players[action.playerid] = players[action.playerid];
      numplayers += 1;

      if(!update.hasOwnProperty('players_joined'))
         update.players_joined = {};
      update.players_joined[action.playerid] = ever_players[action.playerid];

      console.log(players);
      console.log(beginning_players);
      console.log(ever_players);
   };

   var execute_leave = function(action, update)
   {
      if(players.hasOwnProperty(action.playerid))
      {
         numplayers -= 1;
         delete players[action.playerid];
         if(!update.hasOwnProperty('players_left'))
            update.players_left = [];
         update.players_left.push(action.playerid);
      }
   };

   var execute_pickup = function(action, update)
   {
      if(!game_in_progress)
      {
         return;
      }

      var cards = action.cards;

      if(!verify_set(cards))
      {
         return;
      }

      if(!verify_ontable(cards))
      {
         return;
      }

      if(!update.hasOwnProperty('cards_removed'))
         update.cards_removed = [];
      if(!update.hasOwnProperty('card_remover'))
         update.card_remover = [];
      if(!update.hasOwnProperty('cards_added'))
         update.cards_added = [];
      if(!update.hasOwnProperty('player_scoredeltas'))
         update.player_scoredeltas = {};


      /* This pickup is now good, so go remove it from the table */
      var holes = [];
      for(var i = 0; i < 3; i++)
      {
         for(var j = 0; j < table.length; j++)
         {
            if(cards_equal(cards[i], table[j]))
            {
               break;
            }
         }
         table[j] = 0;
         holes.push(j);
         update.cards_removed.push(cards[i]);
         update.card_remover.push(action.playerid);
      }
      holes.sort(function(a,b) { return a-b; });
      var cardsleft = table.length-3;
      for(var i = 0; i < holes.length; i++)
      {
         var holeidx = holes[i];
         if(cardsleft < 12 && unused_cards.length > 0)
         {
            /* Add some cards */
            var newcard = pop_randcard();
            update.cards_added.push(newcard);
            table[holeidx] = newcard;
            cardsleft += 1;
         }
         else
         {
            /* Go pull this card from somewhere else on the table */
            for(var j = table.length-1; j > holeidx; j--)
            {
               if(table[j] != 0)
               {
                  table[holeidx] = table[j];
                  table[j] = 0;
                  break;
               }
            }
         }
      }
      while(table.length > 0 && table[table.length-1]==0)
      {
         table.pop();
      }

      /* Player gets a score for this */
      players[action.playerid] += 1;
      ever_players[action.playerid] += 1;
      update.player_scoredeltas[action.playerid] = 1;
     
      /* Anyone with a noset-request gets the request cleared */
      noset_declarers = [];
      update.noset_declarers = noset_declarers;
      
      /* Cards get added if we have autodeal on and there are no sets */
      while(par.autodeal && unused_cards.length > 0 && !set_exists())
      {
         nosets_addcards(action, update);
      }
      if(par.autodeal && unused_cards.length == 0 && !set_exists())
      {
        execute_end_game(action, update);
      } 

      update.cards_added.reverse(); //want these to come off fifoed
   };

   /* Call this if you have determined that the players agree that there are no
    * sets. This will then add the cards for them. */
   function nosets_addcards(action, update)
   {
      if(unused_cards.length < 3)
      {
         execute_end_game(action, update);
         return;
      }

      if(!update.hasOwnProperty('cards_added'))
         update.cards_added = [];

      for(var i = 0; i < 3; i++)
      {
         var newcard = pop_randcard();
         update.cards_added.push(newcard);
         table.push(newcard);
      }

      last_card_add_timestamp = Date.now();
   }

   var execute_declare_nosets = function(action, update)
   {
      /* First make sure it is at all reasonable to declare no sets */
      if(!game_in_progress)
      {
         return;
      }
      if(table.length >= 21)
      {
         return;
      }
      if(par.strict_noset && set_exists())
      {
         if(!num_noset_bad.hasOwnProperty(action.playerid))
            num_noset_bad[action.playerid] = 0;
         num_noset_bad[action.playerid] += 1;
         update.noset_bad = true;
         return;
      }

      /* Do not process requests coming in quickly on the heels of successful
       * card adds */
      if(action.timestamp - last_card_add_timestamp < 1000)
      {
         return;
      }

      if(numplayers > 1)
      {
         /* If no one has yet declared no sets, then we simply remember this
          * declaration and notify everyone about it */
         if(noset_declarers.length == 0)
         {
            noset_declarers.push(action.playerid);
            update.noset_declarers = noset_declarers;
            return;
         }

         /* Check to make sure it's not the same guy declaring multiple times */
         for(var i = 0; i < noset_declarers.length; i++)
         {
            if(noset_declarers[i] === action.playerid)
            {
               return;
            }
         }
      }

      /* Someone has already declared no sets so it's time to do something! */
      /* Or there is just one player in the game! */
      nosets_addcards(action, update);
      if(update.cards_added)
        update.cards_added.reverse(); //want these to come off fifoed
      noset_declarers = [];
      update.noset_declarers = [];
   };

   var exec = require('child_process').exec;
   function execute_end_game(action, update)
   {
      /* Update our state and the update to say that the game has ended */
      game_in_progress = false;
      update.game_has_ended = true;

      /* Calculate who has always been in game and who has ever been in game */
      var always_players_arr = [];
      var ever_players_arr = [];
      for(p in ever_players)
      {
         if(ever_players.hasOwnProperty(p))
         {
            ever_players_arr.push(p);
         }
         if(players.hasOwnProperty(p) &&
            beginning_players.hasOwnProperty(p))
         {
            always_players_arr.push(p);
         }
      }

      var game_log = 
      {
         stats_processed: false,
         game_type: par.type,
         ever_players: ever_players_arr,
         ever_players_scores: ever_players, 
         always_players: always_players_arr,
         num_noset_bad: num_noset_bad,
         timestamp: game_start_timestamp,
         duration: (action.timestamp-game_start_timestamp),
         actions: action_history,
         updates: update_history,

         version: 2,

         par: par,
      };

      /* Save in the database of games */
      db.games.save(game_log, function()
      { 
         /* Ask for a statistics incremental update */
         exec('python2 statistics/incremental_calculation.py', function(e, so, se)
         {
            console.log('Incremental update done with result ' + so);
         });  
      });

      /* If the person who made this asked for us to do something, to it */
      if(par.hasOwnProperty('gameover_callback'))
         par.gameover_callback(game_log);

      game_start_timestamp = undefined;
   }

   var execute_begin_game = function(action)
   {
      if(game_in_progress)
      {
         return;
      }

      num_starts += 1;
      if(par.hasOwnProperty('max_num_starts')
         && num_starts > par.max_num_starts)
      {
         return;
      }

      /* Init variables to beginning states */
      unused_cards = [];
      table = [];
      pending_actions = [];
      update_history = [];
      action_history = [];
      numplayers = 0;
      num_noset_bad = {};
      ever_players = {};
      beginning_players = {};
      for(p in players)
      {
         if(players.hasOwnProperty(p))
         {
            beginning_players[p] = 0;
            ever_players[p] = 0;
            players[p] = 0;
            numplayers += 1;
         }
      }
      for(i in viewers)
      {
         viewer_stateid[i] = -2;
      }
      noset_declarers = [];

      /* Add all unused cards */
      if(par.hasOwnProperty('fixed_deck'))
      {
         for(var i = 0; i < par.fixed_deck.length; i++)
         {
            unused_cards.push(par.fixed_deck[i]);
         }
      }
      else
      {
         var tmp=[0,0,0,0];
         while(tmp[3] != 3)
         {
            var card = [];
            for(var i = 0; i < 4; i++)
            {
               card.push(tmp[i]);
            }
            unused_cards.push(card);

            tmp[0] += 1;
            for(var i = 0; i < 4; i++)
            {
               if(tmp[i] == 3 && i != 3)
               {
                  tmp[i] = 0;
                  tmp[i+1] += 1;
               }
            }
         }
      }

      /* Deal the first 12 cards */
      while(table.length < 12)
      {
         var newcard = pop_randcard();
         table.push(newcard);
      }

      /* Cards get added if we have autodeal on and there are no sets */
      while(par.autodeal && unused_cards.length > 0 && !set_exists())
      {
        var newcard = pop_randcard();
        table.push(newcard);
      }

      /* And the game is now in progress */ 
      game_in_progress = true;
      game_start_timestamp = Date.now();

      /* Start off our history with a complete update of the beginning state */
      update_history = [ generate_complete_update() ];      
   }

   /* Execute one pending action and return the resulting update object */
   var execute_one_pending = function()
   {
      var update =
      {
         update_type: 'single-step',
         /*players_joined: [], // [playerid,...]
         players_left: [], // [playerid,...]
         player_scoredeltas: {}, // {playerid, delta} pairs
         cards_removed: [], // array of removed cards
         card_remover: [], // playerids corresponding to removed cards
         cards_added: [], // array of added cards*/
      };

      if(pending_actions.length < 1)
         return 0;

      //process one action if it is time
      var processed_actions = 0;
      var action = pending_actions[0];
      if(action.timestamp <= Date.now() - 0.5*worst_ping)
      {
         if(action.action_type == 'join')
         {
            execute_join(action, update);
         }
         else if(action.action_type == 'leave')
         {
            execute_leave(action, update);
         }
         else if(action.action_type == 'pickup')
         {
            execute_pickup(action, update);
         }
         else if(action.action_type == 'declare-nosets')
         {
            execute_declare_nosets(action, update);
         }
         else if(action.action_type == 'begin-game')
         {
            execute_begin_game(action);
         }
         processed_actions += 1;
      }

      if(processed_actions > 0)
      {
         //add supplemental information to update
         stateid += 1;
         update.stateid = stateid;
         update.cards_left = unused_cards.length;
         update.timestamp = Date.now()+0.5*worst_ping;
         if(!game_in_progress)
         {
            update.game_has_ended = true;
            if(par.hasOwnProperty('max_num_starts')
                  && num_starts >= par.max_num_starts)
            {
               update.no_more_starts = true;
            }
         }

         //log the action and update
         action_history.push(pending_actions.splice(0,processed_actions));
         log_update(update);

         return update;
      }
      else
      {
         return 0;
      }
   };

   function recalculate_worst_ping()
   {
      if(Date.now() > worst_ping_recaculated + 4*1000)
      {
         worst_ping_recaculated = Date.now();
         worst_ping = worst_ping_future;
         worst_ping_future = 0;
         if(worst_ping > 2000) //cap on how rediculous we go
         {
            worst_ping = 2000;
         }
      }
   }

   /* Call this every ~100ms and also whenever we know that there's an acion
    * due soon */
   function timestep()
   {
      var update = execute_one_pending();
      while(update !== 0)
      {
         notify_viewers(update);
         update = execute_one_pending()
      }
      recalculate_worst_ping();
      update_timestep_timeout();
   }
   var timestep_interval = setInterval(timestep, 200);

   /* This is a timeout that magically expires and calls timestep() whenever a
    * new action is due to execute. Call update_timestep_timeout() every time
    * you add a new action in order to update the timeout to be correct. */
   var timestep_timeout = null;
   function update_timestep_timeout()
   {
      if(pending_actions.length == 0)
      {
         return;
      }

      var t_to_update =
          pending_actions[0].timestamp - Date.now() + 0.5*worst_ping;
      if(t_to_update <= 0)
      {
         timestep();
      }
      else
      {
         if(timestep_timeout !== null)
         {
            clearTimeout(timestep_timeout);
            timestep_timeout = null;
         }
         timestep_timeout = setTimeout(timestep, t_to_update);
      }
   }

   var ret =
   {

/* Stick the action in our update queue for eventual evaluation */ 
eval_action: 
function(action)
{
   pending_actions.push(action);
   pending_actions = pending_actions.sort(function(a,b)
         {
         return a.timestamp-b.timestamp;
         });
   update_timestep_timeout();
},

/* Register a viewer with us */
register_viewer: function(viewer)
{
  viewers[on_vidx] = viewer;
  viewer_stateid[on_vidx] = -2; //viewer gets full update even in state 0
  viewer.register_game(ret, on_vidx);
  on_vidx++;
},

unregister_viewer: function(idx)
{
   delete viewers[idx];
},

/* Ask for a full update on the game state. Used for error recovery. */
request_full_update: function(viewer_idx)
{
   viewer_stateid[viewer_idx] = -2;
},

/* Tell us how much ping you have so that we can decide when to eval stuff
*/
notify_ping: function(ping_time)
{
   if(worst_ping_future < ping_time)
   {
      worst_ping_future = ping_time;
   }
},

get_numplayers: function()
{
   return numplayers;
},

/* Call this to clean up before removing references to this game */
cleanup: function()
{
   clearInterval(timestep_interval);
}

   };

   return ret;
};

exports.model_game = model_game;
