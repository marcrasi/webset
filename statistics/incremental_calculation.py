"""
You must run this from a place that has `application_config.json` in `.`.
"""

import json
import time
import socket
import sys

# Sleep to give time for the game to appear in storage.
time.sleep(10)

# Acquire a lock. (Running this more than once at a time causes tragedies).
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

# Load application config
with open('application_config.json', 'r') as f:
    config = json.load(f)

#load up all the statistics we will calculate into this list
calculators = []
import heat_map.process as heat_map
calculators.append(heat_map)
import coefficients.coefficients as coefficients
calculators.append(coefficients)

#connect to the database
from google.cloud import datastore
from google.cloud import storage
from google.cloud.exceptions import NotFound

datastore_client = datastore.client.Client()
storage_client = storage.client.Client()
bucket = storage_client.get_bucket(config['googleCloudStorageBucket'])

# Get all the unprocessed games out of it
query = datastore_client.query(kind='GameLogMetadata')
query.add_filter('stats_processed', '=', False)

games = []
for game in query.fetch():
    # Get each game by its key, for strong consistency.
    strongly_consistent_game = datastore_client.get(game.key)
    if strongly_consistent_game['stats_processed'] == False:
        try:
            blob = bucket.blob('games/' + game.key.name + '.json')
            game_string = blob.download_as_string()
            games.append(json.loads(game_string))

            # Set this game as processed, for at-most-once processing.
            strongly_consistent_game['stats_processed'] = True
            datastore_client.put(strongly_consistent_game)
        except NotFound:
            # This game might not be found because of cloud storage eventual
            # consistency. It'll get processed in a later incremental calculation.
            print str(game) + ' not found in storage, passing'
    else:
        print str(game) + ' already processed, passing'

print 'Found %d games' % len(games)

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
         stats_doc_key = datastore_client.key(calc.table_name(), un + '~' + game_type)
         stats_doc = datastore_client.get(stats_doc_key)
         if(stats_doc == None):
            stats_doc = datastore.entity.Entity(stats_doc_key)
            stats_doc['username'] = un
            stats_doc['game_type'] = game_type
            agg_stats = new_stats
         else:
            old_stats = json.loads(stats_doc['statistic'])
            agg_stats = calc.aggregate_statistics([new_stats, old_stats])
         stats_doc['statistic'] = json.dumps(agg_stats)

         print 'Putting %s' % str(stats_doc)
         datastore_client.put(stats_doc)

