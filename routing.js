var db = require("mongojs").connect("set-game", ["games", "ss_ranked_results", "users"]);
var fs = require('fs');
var navbar = fs.readFileSync('views/navbar.html');

function pretty_duration(ms_dur)
{
   var duration = '';
   var s_dur = Math.floor(ms_dur/1000);
   var hours = Math.floor(s_dur/3600);
   var minutes = Math.floor((s_dur%3600)/60);
   var seconds = s_dur%60;
   if(hours > 0)
   {
      duration += hours + ':';
   }
   if(minutes < 10)
   {
      duration += '0' + minutes + ':';
   }
   else
   {
      duration += minutes + ':';
   }
   if(seconds < 10)
   {
      duration += '0' + seconds;
   }
   else
   {
      duration += seconds;
   }
   return duration;
}

exports.apply = function(app)
{
app.get('/games_dump.json',function(req,res)
{
  var start = parseInt(req.query.start, 10);
  db.games.find(
  { /* query */
    /* none */
  }).skip(start).limit(100,
  function(err,qres) /* result function */  {
    if(err)
    {
      res.end('Database error');
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.write(JSON.stringify(qres));
    res.end();
  });
});

app.get('/games_dump_instructions.html',function(req,res)
{
  res.render('games_dump_instructions.html', {navbar: navbar});
});

app.get('/',function(req,res)
{
   db.users.find(
   { /* query */
      /* none */
   },
   { /* relevant fields */
      username: 1
   },
   function(err, userlist) /* result function */
   {
     if(err)
     {
        res.end('Database error');
        return;
     }

     res.render('index.html', {
        username: req.session.username,
        navbar: navbar,
        userlist: userlist,
     });
   });
});

/* I HEREBY PRESENT TO YOU THE MOST UGLY PIECE OF CODE IMAGINABLE. I REALLY
 * SHOULD RETHINK HOW THIS WORKS BEFORE PROCEEDING WITH ANY MORE FEATURES. */
app.get('/speed_solve.html',function(req,res)
{
   var username = req.session.username;

   /* Calculate todaydate */
   var todaydate = (new Date()).toDateString();

   /* Calculate rankdate, prevrankdate, and nextrankdate */
   var rankdate = req.query['rankdate'];
   if(rankdate === undefined)
   {
      rankdate = (new Date()).toDateString();
   }
   var rankdatestruct = new Date(rankdate);
   var dummy = new Date(rankdate);
   dummy.setDate(rankdatestruct.getDate()-1);
   var prevrankdate = dummy.toDateString();
   var dummy = new Date(rankdate);
   dummy.setDate(rankdatestruct.getDate()+1);
   var nextrankdate = dummy.toDateString();

   /* Calculate the status of today's game */
   db.ss_ranked_results.find(
   { /* query */
      username: username,
      date: todaydate
   },
   function(err,ret) /* result function */
   {
      if(err)
      {
         res.end("Database error");
         return;
      }
      var todaystatus;
      if(ret.length == 0)
      {
         todaystatus = "Not Solved";
      }
      else
      {
         todaystatus = "Solved in " + pretty_duration(ret[0].solve_time);
      }

      /* Get the day's rankings */
      db.ss_ranked_results.find(
      { /* query */
         date: rankdate
      }).sort(
      { /* sort field */
         solve_time: 1
      },
      function(err2,rankings) /* result function */
      {
         if(err2)
         {
            res.end("Database error");
            return;
         }

         for(var i = 0; i < rankings.length; i++)
         {
            rankings[i].rank = i+1;
            rankings[i].pretty_solve_time = pretty_duration(rankings[i].solve_time);
            if(rankings[i].username === username)
            {
               rankings[i].isme = true;
            }
         }

         /* Get the other rankings */
         var all_dates = [];
         var date_to_idx = {};
         for(var i = 0; i < 7; i++)
         {
            var tmp_date = new Date((new Date).toDateString());
            tmp_date.setDate(tmp_date.getDate()-i);
            all_dates.push(tmp_date);
            date_to_idx[tmp_date.toDateString()] = i;
         }
         var start_date = all_dates[6];
         var end_date = all_dates[0]; 
         var start_timestamp = start_date.valueOf()-1;
         var end_timestamp = end_date.valueOf()+1;
         var query =
         {
            $and:
            [
            {timestamp: {$gt: start_timestamp}},
            {timestamp: {$lt: end_timestamp}}
            ]
         };
         console.log(start_timestamp);
         console.log(end_timestamp);
         db.ss_ranked_results.find(query,function(err3,seven_results)
         {
            if(err3)
            {
               res.end("Database error");
               return;
            }

            var seven_rankings = {};
            for(var i = 0; i < seven_results.length; i++)
            {
               var tun = seven_results[i].username;
               if(!seven_rankings.hasOwnProperty(tun))
               {
                  seven_rankings[tun] = 
                  {
                     sum: 0,
                     sumsq: 0,
                     num: 0,
                     min: 3600*1000*24,
                     max: 0,
                     pretty_times: ['--','--','--','--','--','--','--']
                  };
               }
               seven_rankings[tun].sum += seven_results[i].solve_time;
               seven_rankings[tun].sumsq += seven_results[i].solve_time*seven_results[i].solve_time;
               seven_rankings[tun].num += 1;

               seven_rankings[tun].pretty_times[date_to_idx[seven_results[i].date]] = pretty_duration(seven_results[i].solve_time);

               if(seven_rankings[tun].min > seven_results[i].solve_time)
               {
                  seven_rankings[tun].min = seven_results[i].solve_time;
               }
               if(seven_rankings[tun].max < seven_results[i].solve_time)
               {
                  seven_rankings[tun].max = seven_results[i].solve_time;
               }
            }

            seven_rankings_arr = [];
            for(tun in seven_rankings)
            {
               if(seven_rankings.hasOwnProperty(tun) && seven_rankings[tun].num >= 3)
               {
                  var avg = seven_rankings[tun].sum/seven_rankings[tun].num;
                  var avgsq = seven_rankings[tun].sumsq/seven_rankings[tun].num;
                  var variance = avgsq-avg*avg;
                  var std = Math.sqrt(variance);

                  var min = seven_rankings[tun].min;
                  var max = seven_rankings[tun].max;

                  seven_rankings[tun].username = tun;
                  seven_rankings[tun].avg = avg;
                  seven_rankings[tun].pretty_avg = pretty_duration(avg);
                  seven_rankings[tun].pretty_std = pretty_duration(std);
                  seven_rankings[tun].pretty_min = pretty_duration(min);
                  seven_rankings[tun].pretty_max = pretty_duration(max);

                  if(tun == username)
                     seven_rankings[tun].isme = true;

                  seven_rankings_arr.push(seven_rankings[tun]);
               }
            }

            seven_rankings_arr.sort(function(a,b) { return a.avg-b.avg; });

            for(var i = 0; i < seven_rankings_arr.length; i++)
            {
               seven_rankings_arr[i].rank = i+1;
            }  
      
            var renderdata =
            {
               username: username,
               navbar: navbar,
               todaystatus: todaystatus,
               todaydate: todaydate,
               rankdate: rankdate,
               prevrankdate: prevrankdate,
               nextrankdate: nextrankdate,
            };
            if(rankings.length > 0)
               renderdata.rankings = rankings;
            if(seven_rankings_arr.length > 0)
               renderdata.seven_rankings = seven_rankings_arr;
            res.render('speed_solve.html', renderdata);

         });



      });
   });
});
app.get('/game2.html',function(req,res)
{
   res.render('game2.html', {
      username: req.session.username,
      navbar: navbar
   });
});
app.get('/more_stats.html',function(req,res)
{
   res.render('more_stats.html', {
      username: req.session.username,
      navbar: navbar
   });
});

app.get('/instructions.html',function(req,res)
{
   res.render('instructions.html', {
      username: req.session.username,
      navbar: navbar
   });
});

/* Pass me the settings that used to be there and the query and I'll
 * create the new settings that arise from this */
function create_new_settings(settings, q)
{
  if(q.show_keyhints === '0' || q.show_keyhints === '1')
  {
    settings.show_keyhints = q.show_keyhints;
  }

  if(q.show_newcards === '0' || q.show_newcards === '1')
  {
    settings.show_newcards = q.show_newcards;
  }

  if(q.colorblind === '0' || q.colorblind === '1')
  {
    settings.colorblind = q.colorblind;
  }

  if(q.deselection_behavior === '0' || q.deselection_behavior === '1') {
    settings.deselection_behavior = q.deselection_behavior;
  }
}

app.get('/settings.html',function(req,res)
{
  var username = req.session.username;

  /* Get the old settings from the database */
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
      res.end('database error');
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

    /* Create the new settings! */
    create_new_settings(settings, req.query);

    /* Update the database with them! */
    db.users.update(
    {
      username: username
    },
    {
      $set: {settings: settings}
    });

    /* Send them the settings page! */
    res.render('settings.html', {
      username: username,
      settings: JSON.stringify(settings),
      navbar: navbar
    });
  });

});

var strftime = require("strftime");
app.get('/game_history.html',function(req,res)
{
   db.games.find(
   { /* query */
      ever_players: req.session.username,   
   },
   { /* relevant fields */
      ever_players_scores: 1,
      always_players: 1,
      timestamp: 1,
      duration: 1,
      game_type: 1
   }).sort(
   { /* sort field */
      timestamp: -1
   },
   function(err, games) /* response function */
   {
      if(err)
      {
         res.end('Database error');
      }
      else
      {
         game_entries = [];
         for(var i = 0; i < games.length; i++)
         {
            var g = games[i];

            var other_players = '';
            for(p in g.ever_players_scores)
            {
               if(g.ever_players_scores.hasOwnProperty(p) && p !== req.session.username)
               {
                  if(other_players.length > 0)
                     other_players += ', ';
                  other_players += p;
               }
            }
            if(other_players.length == 0)
               other_players = '--';

            var present_whole_game = '';
            for(var j = 0; j < g.always_players.length; j++)
            {
               if(g.always_players[j] === req.session.username)
                  break;
            }
            if(j == g.always_players.length)
               present_whole_game = 'No';
            else
               present_whole_game = 'Yes';

            var duration = pretty_duration(g.duration);

            game_entries.push(
            {
               date: strftime('%B %d, %Y at %H:%M:%S', new Date(g.timestamp)),
               duration: duration, 
               present_whole_game: present_whole_game,
               sets_acquired: g.ever_players_scores[req.session.username].toString(), 
               other_players: other_players,
               game_type: g.game_type
            });
         }

         res.render('game_history.html', {
            username: req.session.username,
            navbar: navbar,
            game_entries: game_entries
         });
      }
   });
});


require('./statistics/routing').apply(app);
};
