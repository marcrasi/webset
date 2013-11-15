#Our statistic is a 21-element array. Each element is the number of times
#the player has picked up a card from the corresponding position on the
#table.

import common_lib

def process_game(game):
   statistic_map = {}

   sg = common_lib.SetGame(game)
   for action in sg.actionList:
      if(action.action_type == 'pickup' and action.pickup_success):
         if(not action.player in statistic_map):
            statistic_map[action.player] = [0] * 21
         for idx in action.pickup_idxs:
            statistic_map[action.player][idx] += 1

   return statistic_map

def aggregate_statistics(stats):
   agg = [0] * 21
   for j in range(0,len(stats)):
      for i in range(0,len(agg)):
         agg[i] += stats[j][i]
   return agg

def table_name():
   return 'heat_map_stats'
