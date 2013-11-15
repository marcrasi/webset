#connect to the database
from pymongo import Connection
connection = Connection('localhost', 27017)
db = connection['set-game']

#give everyone some default settings
db.users.update({},{'$set':{'settings':{'show_keyhints':'1','show_newcards':'1','colorblind':'0'}}},multi=True,safe=True)
