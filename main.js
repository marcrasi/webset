var express = require('express');
var connect = require('connect');
var http = require('http');
var whiskers = require('whiskers');
var fs = require('fs');

var login = require('./login');

var sessionStore = new connect.session.MemoryStore;

var configuration = JSON.parse(fs.readFileSync('application_config.json'));

//set up our express app
var app = express();
app.set('views', __dirname+'/views');
app.engine('.html', whiskers.__express);
app.use(express.cookieParser());
app.use(express.session( { secret: configuration.expressSession, store: sessionStore } ));
app.use(express.bodyParser());
app.use(login.login);
app.use(app.router);
app.use(express.static(__dirname+'/public'));

//set up our http server
var server = http.createServer(app);
server.listen(8154);

//set up routes to our dynamic pages
require('./routing').apply(app);

//set up our socket.io server
var io = require('socket.io').listen(server, { log: false });
var cookie = require('cookie');

/* This stuff gets the session and puts it in the handshake data! */
io.set('authorization', function(data, ack)
{
   if(data.headers.cookie)
   {
      var cookies =
         connect.utils.parseSignedCookies(cookie.parse(data.headers.cookie),configuration.expressSession);
      sessionStore.load(cookies['connect.sid'], function(err, sess)
      {
         if(err)
         {
            ack('Bad cookie!', false);
         }
         else
         {
            data.session = sess;
            ack(null, true);
         }
      });
   }
   else
   {
      ack('No cookie!', false);
   }
});

var game_manager = require('./game_manager');
var lobby = require('./model_lobby').model_lobby(game_manager);
var speed_solve = require('./controller_speed_solve');
speed_solve.register_app(app);
speed_solve.register_gm(game_manager);

io.sockets.on('connection', function(socket)
{
   if(!socket.handshake.session)
   {
      console.log('Bad connection');
      return;
   }

   var username = socket.handshake.session.username;

   socket.on('role', function(role)
   {
      if(role.role_type == "lobby")
      {
         socket.on('message', function(message)
         {
            if(message === 'poll')
            {
               lobby.poll(username,function(response)
               {
                  socket.emit('message',response);
               });
            }
            else
            {
               lobby.command(message,username);
            }
         });
         socket.emit('role', true);
      }
      else if(role.role_type == "game")
      {
         if(role.secret === configuration.testAccess)
         {
            username = role.username;
         }

         game_manager.handle_connection(username, role.gameid, socket);
      }
   });
});

/*var model_game = require('./model_game');
var controller_player = require('./controller_player');
var viewer_player = require('./viewer_player');

var gg = model_game.model_game();
setInterval(gg.timestep, 100);

io.sockets.on('connection', function(socket)
{
   var controller = controller_player.controller_player();
   var viewer = viewer_player.viewer_player();

   socket.on('message', function(message)
   {
      controller.process_message(message);
   });

   controller.register_game(gg);
   gg.register_viewer(viewer);
   viewer.register_socket(socket);
});
*/
