import sys
print "WARNING, THIS IS AN OUTDATED MIGRATION!"
sys.exit()

#connect to the database
from pymongo import Connection
connection = Connection('localhost', 27017)
db = connection['set-game']

#fix spelling solitare=>solitaire
db.games.update({'game_type':'ranked-solitare'},{'$set':{'game_type':'ranked-solitaire'}},multi=True,safe=True)
db.games.update({'game_type':'practice-solitare'},{'$set':{'game_type':'practice-solitaire'}},multi=True,safe=True)

#recalculate statistics
db.heat_map_stats.remove()
db.coefficient_stats.remove()
db.games.update({},{'$set':{'stats_processed':False}},multi=True,safe=True)
import os
os.system("cd ../statistics && python2 incremental_calculation.py")
