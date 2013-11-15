#Acquire a lock. (Running this more than once at a time causes tragedies).
import socket
import sys
import time
have_lock = False
num_tries = 0
while(not have_lock):
   lock_socket = socket.socket(socket.AF_UNIX, socket.SOCK_DGRAM)
   try:
      lock_socket.bind('\0' + 'incremental_calculation.py')
      have_lock = True
      print 'I got the lock!'
   except socket.error:
      if(num_tries < 1):
         print 'Lock exists, retrying!'
         time.sleep(1)
      else:
         print 'Lock still exists, exiting!'
         sys.exit()
   num_tries += 1

#load up all the statistics we will calculate into this list
calculators = []
import heat_map.process as heat_map
calculators.append(heat_map)
import coefficients.coefficients as coefficients
calculators.append(coefficients)

#connect to the database
from pymongo import Connection
connection = Connection('localhost', 27017)
db = connection['set-game']

#get all the unprocessed games out of it
games = []
while(True):
   game = db.games.find_and_modify({'stats_processed':False},{'$set':{'stats_processed':True}})
   if(game == None):
      break
   games.append(game)

from collections import defaultdict
for calc in calculators:
   #calculate all the statistics and stick them in a dict
   map_un_type_to_stat_list = defaultdict(lambda: defaultdict(list))

   for game in games:
      processed = calc.process_game(game)

      #hax for not counting bots
      if('slow_bot' in processed):
         del(processed['slow_bot'])
      if('medium_bot' in processed):
         del(processed['medium_bot'])
      if('alice' in processed):
         del(processed['alice'])
      if('bob' in processed):
         del(processed['bob'])


      for p in processed:
         if(not 'game_type' in game):
            game['game_type'] = 'unspecified'
         map_un_type_to_stat_list[p][game['game_type']].append(processed[p])
          
   #aggregate them all together
   map_un_type_to_stat = defaultdict(dict)
   for un in map_un_type_to_stat_list:
      for game_type in map_un_type_to_stat_list[un]:
         map_un_type_to_stat[un][game_type] \
            = calc.aggregate_statistics(map_un_type_to_stat_list[un][game_type])

   #aggregate along un
   map_type_to_stat_list = defaultdict(list)
   for un in map_un_type_to_stat:
      for game_type in map_un_type_to_stat[un]:
         map_type_to_stat_list[game_type].append(map_un_type_to_stat[un][game_type])
   for game_type in map_type_to_stat_list:
      map_un_type_to_stat['(ALL)'][game_type] \
         = calc.aggregate_statistics(map_type_to_stat_list[game_type])

   #aggregate along game-type
   map_un_to_stat_list = defaultdict(list)
   for un in map_un_type_to_stat:
      for game_type in map_un_type_to_stat[un]:
         map_un_to_stat_list[un].append(map_un_type_to_stat[un][game_type])
   for un in map_un_to_stat_list:
      map_un_type_to_stat[un]['(ALL)'] \
         = calc.aggregate_statistics(map_un_to_stat_list[un])

   #aggregate new statistics with the old ones and stick in database
   for un in map_un_type_to_stat:
      for game_type in map_un_type_to_stat[un]:
         new_stats = map_un_type_to_stat[un][game_type]
         old_stats_doc = db[calc.table_name()].find_one({'username':un,'game_type':game_type})
         if(old_stats_doc == None):
            agg_stats = new_stats
         else:
            old_stats = old_stats_doc['statistic']
            agg_stats = calc.aggregate_statistics([new_stats, old_stats])
         db[calc.table_name()].update({'username':un,'game_type':game_type},{'$set':{'statistic':agg_stats}},True)

