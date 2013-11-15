function fake_socket(ms_delay, delay_pm)
{
   var real_socket = io.connect();

   var ret =
   {
      emit: function(t, m)
      {
         var this_delay = ms_delay + (2*Math.random()-1)*delay_pm;
         setTimeout(function()
         {
            real_socket.emit(t, m);
         }, this_delay); 
      },

      on: function(t, f)
      {
         real_socket.on(t, function(msg)
         {
            var this_delay = ms_delay + (2*Math.random()-1)*delay_pm;
            setTimeout(function()
            {
               f(msg);
            }, this_delay); 
         });
      }
   };

   console.log('Starting a fake socket with lag ' + ms_delay + ' +/- ' +
   delay_pm);

   return ret;
}
