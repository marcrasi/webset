var db = require("mongojs").connect("set-game", ["users"]);
var crypto = require("crypto");

/* Shows a login page with the given message */
function show_login_page(res, message)
{
   res.render('login_page.html', {message:message});
}

/* Shows a registration page with the given message */
function show_registration_page(res, message)
{
   res.render('registration_page.html', {message:message});
}

/* Authenticates and returns a username string if successful and false if not */
function authenticate(req, func)
{
   var un = req.body.username;
   var pw = req.body.password;

   db.users.find({username:un}, function(err, user)
   {
      if(err)
      {
         func(false, 'database error');
      }
      else if(user.length == 0)
      {
         func(false, 'username does not exist');
      }
      else
      {
         var salt = user[0].salt; //(new Buffer(user[0].salt,'base64')).toString('binary');
         crypto.pbkdf2(pw, salt, 10000, 512, function(err, pwhash)
         {
            var pwhashhex = (new Buffer(pwhash,'binary')).toString('base64');
            if(user[0].password !== pwhashhex)
            {
               func(false, 'password incorrect');
            }
            else
            {
               func(un, '');
            }
         });
      }
   });
}

/* Registers a user and returns true if successful and an error message if not */
function register(req, func)
{
   /* Validate username */
   var un = req.body.username;
   if(!/^[a-zA-Z0-9_.]+$/.test(un))
   {
      func('You put bad characters in the username. Or it is empty. Try again.');
      return;
   }

   /* Validate password */
   var pw = req.body.password;
   var pw2 = req.body.password2;
   if(pw.length < 5)
   {
      func('Your password is too short. Try again.');
      return;
   }
   if(pw !== pw2)
   {
      func("Your passwords don't match. Try again.");
      return;
   }

   /* Validate email */
   var email = req.body.email; //just kidding, we don't validate this

   /* Notice the race condition. TODO: fix it. */
   db.users.find({username:un}, function(err,usernames)
   {
      if(err)
      {
         func('database error');
         return;
      }
      if(usernames.length > 0)
      {
         func('That username (' + un + ') already exists. Try another one.');
         return;
      }

      /* Generate salt and hash */
      var salt = (new Buffer(crypto.randomBytes(512),'binary')).toString('base64');
      crypto.pbkdf2(pw, salt, 10000, 512, function(err, pwhash)
      {
         if(err)
         {
            func('Password hashing error');
            return;
         }

         /* Default settings */
         var settings =
         {
            show_keyhints: '1',
            show_newcards: '1',
            colorblind: '0',
            deselection_behavior: '0'
         };

         /* Save this user in database */
         db.users.insert(
         {
            username: un,
            password: (new Buffer(pwhash,'binary')).toString('base64'),
            salt: salt, //(new Buffer(salt,'binary')).toString('base64'),
            email: email,
            settings: settings
         },
         function(err)
         {
            if(err)
            {
               func('database error on insertion');
               return;
            }
   
            func(true);
         });
      });
   });
}

/* Sends a response redirecting us to the root page */
function redirect_to_root(res)
{
   res.statusCode = 301;
   res.setHeader('Location', '/');
   res.end('Redirecting to /');
}

exports.login = function(req, res, next)
{

   if(req.url == '/logout')
   {
      req.session.destroy();
      res.statusCode = 301;
      res.setHeader('Location', '/');
      res.end('You have logged out. Redirecting to /');
      return;
   }

   if(req.session && req.session.username) return next();

   if(req.url == '/registration_page')
   {
      show_registration_page(res,'');
      return;
   }

   if(req.url == '/register')
   {
      register(req, function(success)
      {
         if(success === true)
         {
            res.statusCode = 301;
            res.setHeader('Location', '/registration_success');
            res.end('Redirecting to /');
         }
         else
         {
            show_registration_page(res, success);
         }
      });
      return;
   }

   if(req.body.username && req.body.password)
   {
      authenticate(req, function(username, err)
      {
         if(username === false)
         {
            show_login_page(res, 'Your login failed because of ' + err + ' so you should try again here!');
         }
         else
         {
            req.session.username = username;
            redirect_to_root(res);
         }
      });
   }
   else
   {
      if(req.url == '/registration_success')
      {
         show_login_page(res, 'Registration successful! You can now log in here.');
      }
      else
      {
         show_login_page(res, 'You are not logged in, so you should log in here!');
      }
   }
}
