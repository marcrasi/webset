var db = require("mongojs").connect("set-game", ["users"]);

var viewer_player = function(username)
{
   var socket;

   var game; //which game we are viewing
   var viewer_idx; //our index in the game
   
   var ret = 
   {
      register_socket: function(sk)
      {
         socket = sk;
         socket.on('message', function(msg)
         {
            /* TODO: this should really be in the controller. I don't
               know what stupidity caused me to put it here. SO FIX! */
            if(msg.action_type == 'request-full-update')
            {
               game.request_full_update(viewer_idx);
            }
         });

         /* Send the view our settings */
         db.users.find(
         { /* query */
           username: username
         },
         { /* relevant fields */
           settings: 1
         },
         function(err, settings) /* response function */
         {
           if(err || settings.length != 1)
           {
             /* there's been some kind of database error, so die */
             return;
           }

           if(settings[0].hasOwnProperty('settings'))
           {
             settings = settings[0]['settings'];
           }
           else
           {
             settings = {};
           }

           socket.emit('settings', settings);
         });
      },
      send_update: function(up)
      {
         socket.emit('message', up);
      },
      register_game: function(g, idx)
      {
         game = g;
         viewer_idx = idx;
      },
      unregister_from_game: function()
      {
         game.unregister_viewer(viewer_idx);
      }
   };

   return ret;
};

exports.viewer_player = viewer_player;
