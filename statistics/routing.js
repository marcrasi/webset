var db = require("../dbconnection");
var fs = require('fs');
var navbar = fs.readFileSync('views/navbar.html');
var group_selector = fs.readFileSync('statistics/group_selector.html');

function render_statistic(req,res,filename,kind,selection_options)
{
   var data = {};

   /* Set up username and navbar */
   data.username = req.session.username;
   data.navbar = navbar;

   /* Set up the group selector */
   data.group_selector = group_selector;
   data.group_selector_data = {};
   data.group_selector_data.game_types =
   [
      '(ALL)',
      'lobby',
      'ranked-solitaire',
      'practice-solitaire'
   ];
   data.group_selector_data.selection_options = selection_options;
   db.runQuery(db.createQuery('User'), function(err, usernames)
   {
      if(err)
      {
         console.error(err);
         res.end('Database error');
         return;
      }
      data.group_selector_data.usernames = ['(ALL)'];
      for(var i = 0; i < usernames.length; i++)
      {
         data.group_selector_data.usernames.push(usernames[i].username);
      }

      /* Determine who and what to show */
      var selected_game_type = req.query['game_type'];
      if(selected_game_type === undefined)
         selected_game_type = '(ALL)';
      var selected_username = req.query['username'];
      if(selected_username === undefined)
         selected_username = req.session.username;
      data.group_selector_data.game_type = selected_game_type;
      data.group_selector_data.username = selected_username;

      /* Get the actual statistic! */
      var query = db.createQuery(kind);
      if(selection_options.username)
         query.filter('username', selected_username);
      if(selection_options.game_type)
         query.filter('game_type', selected_game_type);
      query.order('username');
      db.runQuery(query, function(err, stat_data)
      {
         if(err)
         {
            console.error(err);
            res.end('Database error');
            return;
         }
         stat_data.forEach(function(x) {
            x.statistic = JSON.parse(x.statistic.toString('utf8'));
         });
         data.stat_data = JSON.stringify(stat_data);
         res.render(filename,data);
      });
   });

}

exports.apply = function(app)
{
   app.get('/heat_map.html',function(req,res)
   {
      render_statistic(req,res,'heat_map.html','HeatMapStat',
         {username: true, game_type: true});
         //{username: true});
         //{game_type: true});
   });
   app.get('/coefficients.html',function(req,res)
   {
      render_statistic(req,res,'coefficients.html','CoefficientStat',
         {game_type: true});
   });
};
