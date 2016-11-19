var name_generator = require('./name_generator');
var model_game = require('./model_game');
var db = require("./dbconnection");

function _get_valid_usernames(candidates, callback) {
  if (candidates.length == 0) {
    callback(false, []);
  } else {
    var query = db.createQuery('User').filter('username', candidates[0]);
    db.runQuery(query, function(err, results) {
      if (err) {
        console.error(err);
        callback(err, null);
      } else {
        _get_valid_usernames(candidates.slice(1), function(err, valid_usernames) {
          if (err) {
            console.error(err);
            callback(err, null)
          } else {
            for(var i = 0; i < results.length; i++) {
              valid_usernames.push(results[i].username);
            }
            callback(false, valid_usernames);
          }
        });
      }
    });
  }
}

var model_lobby = function(game_manager)
{
   var games = {}; /* gid->lobby_game_structure map */
   /* a lobby_game_structure looks like this:
   {
      name:
      creator:
   }*/

   var creators = {}; /* username->{num active created games} map */

   function generate_gname()
   {
      return name_generator.generate_name();
   }

   var ret =
   {
      poll: function(username,respond)
      {
         var response = {};
         for(gid in games)
         {
            if(games.hasOwnProperty(gid))
            {
               var game = game_manager.get_game(gid);
               if(game === undefined)
               {
                  creators[games[gid].creator] -= 1;
                  delete games[gid];
               }
               else
               {
                  var iamingame = !games[gid].private_game;
                  for(var i = 0; i < games[gid].private_users.length; i++)
                  {
                    if(games[gid].private_users[i] == username)
                    {
                      iamingame = true;
                      break;
                    }
                  }

                  if(iamingame)
                  {
                    response[gid] = {
                      name: games[gid].name,
                      numplayers: game.get_numplayers(),
                      private_game: games[gid].private_game,
                      autodeal: games[gid].autodeal,
                      verify: games[gid].verify,
                      private_users: games[gid].private_users,
                    };
                  }
               }
            }
         }
         respond(response);
      },
      command: function(message,username)
      {
         if(message.command_type == 'add-game')
         {
            /* Count how many games this user has created */
            if(!creators.hasOwnProperty(username))
               creators[username] = 0;
            if(creators[username] >= 5)
               return;

            /* Set default settings if there aren't any */
            var gname = generate_gname();
            if(!message.hasOwnProperty('game_settings'))
            {
              message.game_settings =
              {
                game_name: gname,
                autodeal: false,
                verify_noset: false,
                private_game: false,
                private_users: [],
              };
            }

            /* Fix up list of private users to only have actual valid users in it */
            message.game_settings.private_users.push(username);
            _get_valid_usernames(message.game_settings.private_users, function(err, valid_usernames)
            {
              if(err) {
                 console.error(err);
                 return;
              }

              message.game_settings.private_users = [];
              message.game_settings.private_users = valid_usernames;

              /* Make the game */
              var game_par =
              {
                 type: 'lobby',
                 strict_noset: message.game_settings.verify_noset,
                 autodeal: message.game_settings.autodeal,
              };
              var game = model_game.model_game(game_par);

              /* Register game with game manager */
              var manager_par =
              {
                 game: game,
                 everyone_allowed: !message.game_settings.private_game,
                 allowed_players: {},
                 empty_timeout: 3*60*1000
              };
              if(!manager_par.everyone_allowed)
              {
                 for(var i = 0; i < message.game_settings.private_users.length; i++)
                 {
                    manager_par.allowed_players[message.game_settings.private_users[i]] = true;
                 }
              }
              var gid = game_manager.pass_game(manager_par);

              /* Register game with ourselves */
              games[gid] =
              {
                 name: message.game_settings.game_name,
                 creator: username,
                 private_game: message.game_settings.private_game,
                 private_users: message.game_settings.private_users,
                 autodeal: message.game_settings.autodeal,
                 verify: message.game_settings.verify_noset,
              };
              creators[username] += 1;
            });
         }
      }
   };

   return ret;
};

exports.model_lobby = model_lobby;
