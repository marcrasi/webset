var controller_player = function(playerid)
{
   var game;

   var ping_time = 0;
   var ping_time_measurements = 0;

   var theinterval;
   var disconnectcallback;

   function dodisconnect()
   {
      /* MAYBE TODO: If we don't trust socket.io's disconnect event, we need to
       * implement our own! */
      ret.process_message(
      {
         action_type: 'leave'
      });
      clearInterval(theinterval);
      disconnectcallback();
   }

   var ret =
   {
      register_game: function(g)
      {
         game = g;
      },
      process_message: function(message)
      {
         message.playerid = playerid;
         if(ping_time_measurements > 5)
         {
            message.timestamp = Date.now()-0.5*ping_time;
         }
         else
         {
            message.timestamp = Date.now();
         }
         game.eval_action(message);
      },
      register_socket: function(socket)
      {
         socket.on('message',function(message)
         {
            ret.process_message(message);
         });
         socket.on('timeping',function(msg)
         {
            ping_time = 0.75*ping_time + 0.25*(Date.now()-msg.timestamp);
            ping_time_measurements += 1;
            if(ping_time_measurements > 5)
            {
               game.notify_ping(ping_time);
            }
         });
         socket.on('disconnect',function()
         {
            dodisconnect();
         });
         theinterval = setInterval(function()
         {
            socket.emit('timeping',{timestamp: Date.now(), ping_time: ping_time});
         }, 1000);
      },
      on_disconnect: function(cb)
      {
         disconnectcallback = cb;
      }
   };

   return ret;
};

exports.controller_player = controller_player;
