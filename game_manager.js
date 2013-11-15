/* This manages all the active games. Ie, it controlls who can access them and
 * it sets up access when someone who is authorized asks for it. It also kills
 * games when they have met their ending conditions.

 * Of course, this also provides some functions for other pieces of the code to
 * create games under our management.
 */

/*
active_games is a map gameid->gamestructure

gameid is simply some integer that identifies the game

gamestructure looks like this:
{
   everyone_allowed: true/false
   allowed_players: {'player1': true, 'player2': true, ...}
   game: <the actual game datastructure>
   empty_timeout: <how long the game stays empty until it vanishes in msec>
   last_nonempty_time: <a time in msec>
}
*/
var ongameid = 0;
var active_games = {};

var controller_player = require('./controller_player');
var viewer_player = require('./viewer_player');

/* Call me whenever anyone tries to make a connection by emitting a 'role' */
exports.handle_connection = function(username, gameid, socket)
{
   /* Make sure the game actually exists */
   if(!active_games.hasOwnProperty(gameid))
   {
      socket.emit('role', { error: 'No game with this gameid' });
      return;
   }

   /* Get the game's structure */
   var game_structure = active_games[gameid];

   /* Make sure user has permission to connect to game */
   if(!game_structure.everyone_allowed &&
      !game_structure.allowed_players.hasOwnProperty(username))
   {
      console.log(game_structure.everyone_allowed);
      console.log(game_structure.allowed_players);
      socket.emit('role', { error: 'You are not allowed in this game' });
      return;
   }

   /* It's all good! Hook everything up! */
   var controller = controller_player.controller_player(username);
   var viewer = viewer_player.viewer_player(username);
   controller.register_socket(socket);
   viewer.register_socket(socket);
   controller.register_game(game_structure.game);
   game_structure.game.register_viewer(viewer);
   controller.on_disconnect(function()
   {
      viewer.unregister_from_game();
   });
   socket.emit('role', true);
};

/* Call this to pass over a game to my control */
/*
par.game = the game you're passing
par.everyone_allowed = true/false controlls access
par.allowed_players = {'player1': true, ...} controlls access
par.empty_timeout = <msec> says how long until this game dies when there are no
   players in it

We return a gameid you can use to access this game.
*/
exports.pass_game = function(par)
{
   var gameid = ongameid++;
   active_games[gameid] = par;
   active_games[gameid].last_nonempty_time = Date.now();
   return gameid; 
};

/* Returns the game that gameid points to */
exports.get_game = function(gameid)
{
   if(!active_games.hasOwnProperty(gameid))
      return undefined;
   return active_games[gameid].game;
}

/* Handles game timeouting */
function handle_timeouts()
{
   for(gid in active_games)
   {
      if(active_games.hasOwnProperty(gid))
      {
         if(active_games[gid].game.get_numplayers() > 0)
         {
            active_games[gid].last_nonempty_time = Date.now();
         }
         else
            if(Date.now()-active_games[gid].last_nonempty_time>active_games[gid].empty_timeout)
         {
            active_games[gid].game.cleanup();
            delete active_games[gid]; 
         }
      }
   }
}
setInterval(handle_timeouts, 2000);
