var db = require("mongojs").connect("set-game",
    ["ss_practice_results", "ss_ranked_decks", "ss_ranked_results"]);
var model_game = require('./model_game');

/* Map of username->{the gid for the practice they have open, if any} */
var practice_open = {};

/* Map of username->day->{the gid of the ranked they have open, if any} */
var ranked_open = {};
/* TODO: Clean this up. it could leak small amount of memory over large amount
 * of time!! */

var game_manager;

function redirect_to_gid(res, res, gid)
{
   res.statusCode = 301;
   res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
   res.setHeader("Pragma", "no-cache");
   res.setHeader("Expires", 0);   
   res.setHeader('Location', 'game2.html?gameid=' + gid.toString());
   res.end('Redirecting to your game');
}

function insert_result_curry(table, username, date)
{
   return function(game_log)
   {
      var num_noset_bad = 0;
      if(game_log.num_noset_bad.hasOwnProperty(username))
         num_noset_bad = game_log.num_noset_bad[username];

      var timestamp = Date.now();
      if(date !== "N/A")
      {
         timestamp = (new Date(date)).valueOf();
      }

      db[table].insert({
         username: username,
         timestamp: timestamp,
         date: date,
         solve_time: game_log.duration,
         num_noset_bad: num_noset_bad,
      });
   };
}

function start_practice(req, res)
{
   var username = req.session.username;
   /* First open up a game if they don't have one open already */
   if(!practice_open.hasOwnProperty(username) ||
      game_manager.get_game(practice_open[username]) == undefined)
   {
      /* They don't have one open. Make one. */
      var game_par =
      {
         type: 'practice-solitaire',
         strict_noset: true,
         gameover_callback: insert_result_curry("ss_practice_results", username, "N/A")
      };
      var game = model_game.model_game(game_par);
      var allowed_players = {};
      allowed_players[username] = true;
      var par =
      {
         game: game,
         everyone_allowed: false,
         allowed_players: allowed_players,
         empty_timeout: 60*1000
      };
      var gid = game_manager.pass_game(par);
      practice_open[username] = gid;
   }

   /* Redirect them to the game they have */
   var gid = practice_open[username];
   redirect_to_gid(req, res, gid); 
}

function start_ranked(req, res)
{
   var username = req.session.username;
   var reqdate = unescape(req.query['date']);

   /* Get today and yesterday as strings */
   var today = new Date();
   var yesterday = new Date();
   yesterday.setDate(today.getDate()-1);
   var today_str = today.toDateString();
   var yesterday_str = yesterday.toDateString();

   /* Check to make sure the request is for today or yesterday */
   if(reqdate != today_str && reqdate != yesterday_str)
   {
      res.end('Error, bad date!');
      return; 
   }

   /* Check to make sure you have not played this date already */
   db.ss_ranked_results.find({username:username,date:reqdate},function(err,ret)
   {
      if(err)
      {
         res.end('Database error!');
         return;
      }
      if(ret.length>0)
      {
         res.end('You appear to have already played this date!');
         return;
      }

      /* Load up the fixed deck */
      db.ss_ranked_decks.find({date:reqdate},function(err2,ret2)
      {

         if(err2)
         {
            res.end('Database error!');
            return;
         }
         if(ret2.length != 1)
         {
            res.end('Could not find deck for this date!');
            return;
         }

         /* Open up a game if they don't have one already */
         if(!ranked_open.hasOwnProperty(username)
            || !ranked_open[username].hasOwnProperty(reqdate)
            || game_manager.get_game(ranked_open[username][reqdate]) === undefined)
         {
            var game_par =
            {
               type: 'ranked-solitaire',
               strict_noset: true,
               max_num_starts: 1,
               fixed_deck: ret2[0].deck,
               gameover_callback: insert_result_curry("ss_ranked_results", username, reqdate)
            };
            var game = model_game.model_game(game_par);
            var allowed_players = {};
            allowed_players[username] = true;
            var par =
            {
               game: game,
               everyone_allowed: false,
               allowed_players: allowed_players,
               empty_timeout: 60*1000,
            };
            var gid = game_manager.pass_game(par);
            if(!ranked_open.hasOwnProperty(username))
            {
               ranked_open[username] = {};
            }
            ranked_open[username][reqdate] = gid;
         }

         /* Redirect them to the game they have */
         var gid = ranked_open[username][reqdate];
         redirect_to_gid(req, res, gid);

      });
   });
}

function control(req, res)
{
   if(req.query['type'] == 'practice')
   {
      start_practice(req, res);
   }
   else if(req.query['type'] == 'ranked')
   {
      start_ranked(req, res);
   }
   else
   {
      res.end('Error, unrecognized ss type!');
   }
}

exports.register_app = function(app)
{
   app.get('/ss_control',control);
};

exports.register_gm = function(gm)
{
   game_manager = gm;
};

/* Return a random deck of cards */
function random_deck()
{
   var cards = [];
   var tmp=[0,0,0,0];
   while(tmp[3] != 3)
   {
      var card = [];
      for(var i = 0; i < 4; i++)
      {
         card.push(tmp[i]);
      }
      cards.push(card);

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

   var shuffled_cards = [];
   while(cards.length > 0)
   {
      var randidx = Math.floor(Math.random()*cards.length);
      shuffled_cards.push(cards.splice(randidx,1)[0]);
   }

   return shuffled_cards;
}

function add_deck_to_date_curry(datestr)
{
   return function(err,ret)
   {
      if(err)
      {
         console.log("Database error while fixing decks!");
         return;
      }
      if(ret.length==0)
      {
         db.ss_ranked_decks.insert(
         {
            date: datestr,
            deck: random_deck()
         },function(err2,ret2)
         {
            if(err2)
            {
               console.log("Database error while inserting fixed deck!");
            }
         });
      }
   };
}

/* Make 3 days of fixed decks around current date (if they don't already exist) */
function make_fixed_decks()
{
   var now = new Date();
   console.log("Making fixed decks on " + now.toString());
   for(var i = -3; i <= 3; i++)
   {
      var thisdate = new Date();
      thisdate.setDate(now.getDate()+i);
      var thisstr = thisdate.toDateString();
      db.ss_ranked_decks.find({date:thisstr},add_deck_to_date_curry(thisstr))
   }
}
make_fixed_decks();
setInterval(make_fixed_decks, 3600*1000); //every hour is overkill but whatever
