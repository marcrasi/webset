function tester(myun, socket, mean, randomness, gameid, secret)
{
   //console.log(mean);
   //console.log(randomness);

   var board = [];
   var my_pending_sets = [];

   var heatmap = [];
   for(var i = 0; i < 21; i++)
   {
      heatmap.push(0);
   }

   var par =
   {
      gameid: gameid,
      socket: socket,
      connected_callback: connected,
      disconnected_callback: disconnected,
      deselect_all_callback: deselect_all,
      replace_callback: replace,
      playerlist_callback: update_playerlist,
      numcards_callback: update_cardsleft,
      time_callback: time_callback,
      game_par_callback: gametype_callback,
      noset_declaration_callback: noset_declaration
   };
   ctl = controller(par);
   ctl.connect(secret, myun);

   /* UTILS */
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
   function arrtocardidx(card)
   {
      return card[0]+3*(card[1]+3*(card[2]+3*card[3]));
   }
   function cardidxtoarr(cardidx)
   {
      var arr = [];
      for(var i = 0; i < 4; i++)
      {
         arr.push(cardidx % 3);
         cardidx = Math.floor(cardidx/3);
      }
      return arr;
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

   var gettertimeout = undefined;

   function get_a_set()
   {
      gettertimeout = undefined;

      var have_card = {};
      for(var i = 0; i < board.length; i++)
      {
         if(board[i] != undefined && board[i] != 0)
         {
            have_card[arrtocardidx(board[i])] = i;
         }
      }

      var all_sets = [];
      for(var i = 0; i < board.length; i++)
      {
         for(var j = i+1; j < board.length; j++)
         {
            if(board[i] != undefined && board[i] != 0
               && board[j] != 0 && board[j] != undefined
               && have_card[arrtocardidx(add_cards(board[i],board[j]))] !== undefined)
            {
               var set = {
                  set: [],
                  timestamp: Date.now(),
                  idxs: [i, j, have_card[arrtocardidx(add_cards(board[i],board[j]))]] 
               };
               set.set.push(board[i]);
               //ctl.select_card(board[i]);
               set.set.push(board[j]);
               //ctl.select_card(board[j]);
               set.set.push(add_cards(board[i],board[j]));
               //ctl.select_card(add_cards(board[i],board[j]));
               setfound = true;
               //my_pending_sets.push(set);
               all_sets.push(set);
            }
         }
      }

      if(all_sets.length == 0)
      {
         ctl.declare_nosets();
         console.log('DECLARED!!');
      }
      else
      {
         var randidx = Math.floor(Math.random()*all_sets.length);
         set = all_sets[randidx];
         /* Note that if this were multithreaded this would be a race condition
          * here. But I don't think any JS anywhere is multithreaded. */
         ctl.select_card(set.set[0]);
         ctl.select_card(set.set[1]);
         ctl.select_card(set.set[2]);
         my_pending_sets.push(set);
      }

      var rand = Math.random();
      var randamount = Math.random()*randomness;
      var timeto = randamount+mean;
      //console.log('' + rand + ' ' + randamount + ' ' + timeto + ' ' + mean);
      gettertimeout = setTimeout(get_a_set, timeto);
   }

   function connected()
   {
      //console.log('We are in');
      var timeto = Math.random()*randomness+mean;
      gettertimeout = setTimeout(get_a_set, timeto);
      //console.log('Set ' + timeto);
   }

   function noset_declaration()
   {

   }

   function disconnected()
   {

   }

   function gametype_callback()
   {

   }

   function deselect_all()
   {

   }

   function replace(replacement)
   {
      if(gettertimeout !== undefined)
      {
         clearTimeout(gettertimeout);
         var rand = Math.random();
         var randamount = Math.random()*randomness;
         var timeto = randamount+mean;
         //console.log('' + rand + ' ' + randamount + ' ' + timeto + ' ' + mean);
         gettertimeout = setTimeout(get_a_set, timeto);
      }

      var removed_cards = [];
      var remover = [];
      var added_cards = [];

      /* Replace all the cards */
      for(idx in replacement)
      {
         if(board.hasOwnProperty(idx) && board[idx] != 0)
         {
            removed_cards.push(board[idx]);
            remover.push(replacement[idx].remover);
         }
         board[idx] = replacement[idx].new_card;
         added_cards.push(board[idx]);
      }

      /* Eliminate removed_cards that have actually only been moved */
      var actually_removed_cards = [];
      var actual_removers = [];
      for(var i = 0; i < removed_cards.length; i++)
      {
         var has_been_added = false;
         for(var j = 0; j < added_cards.length; j++)
         {
            if(cards_equal(removed_cards[i],added_cards[j]))
            {
               has_been_added = true;
               break;
            }
         }
         if(!has_been_added)
         {
            actually_removed_cards.push(removed_cards[i]);
            actual_removers.push(remover[i]);
         }
      }

      /* Search for our sets in this result */
      var got_sets = [];
      var missed_sets = [];
      for(var i = 0; i < my_pending_sets.length; i++)
      {
         var setmatched = false;
         for(var j = 0; j < my_pending_sets[i].set.length; j++)
         {
            for(var k = 0; k < actually_removed_cards.length; k++)
            {
               if(cards_equal(my_pending_sets[i].set[j],
                     actually_removed_cards[k]))
               {
                  if(actual_removers[k] == myun)
                  {
                     /* We got this set!! */
                     got_sets.push(i);
                  }
                  else
                  {
                     /* Someone else got our set, so forget about it */
                     missed_sets.push(i);
                  }
                  setmatched = true;
                  break;
               }
            }
            if(setmatched)
               break;
         }
      }

      /* Handle the sets we got */
      for(var i = 0; i < got_sets.length; i++)
      {
         var timedelta = 
            Date.now() - my_pending_sets[got_sets[i]].timestamp;
         //console.log(timedelta);
         for(var j = 0; j < 3; j++)
         {
            heatmap[my_pending_sets[got_sets[i]].idxs[j]] += 1;
         }
         //console.log(heatmap);
         delete my_pending_sets[got_sets[i]];
      }

      /* Remove the sets we didn't get */
      for(var i = 0; i < missed_sets.length; i++)
      {
         delete my_pending_sets[missed_sets[i]];
      }

      /* Clean up the array */
      var mps_defd = [];
      for(var i = 0; i < my_pending_sets.length; i++)
      {
         if(my_pending_sets[i] != undefined)
         {
            mps_defd.push(my_pending_sets[i]);
         }
      }
      my_pending_sets = mps_defd;
   }

   function update_playerlist()
   {

   }

   function update_cardsleft(num)
   {
      if(num == -1)
      {
         ctl.begin_game();
      }
   }

   function time_callback()
   {
   };

   var ret =
   {
   };

   return ret;
}
