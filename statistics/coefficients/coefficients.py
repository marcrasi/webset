#Our statistic is a dict with keys 
#  {monocolor, mononumber, monoshape, monoshading, total}
#Each key maps to the number of sets picked up with the corresponding
#property

import common_lib

emptystat = { \
      'mononumber': 0, \
      'monocolor': 0, \
      'monoshape': 0, \
      'monoshading': 0, \
      'total': 0 \
}

def process_game(game):
   statistic_map = {}

   sg = common_lib.SetGame(game)
   for action in sg.actionList:
      if(action.action_type == 'pickup' and action.pickup_success):
         if(not action.player in statistic_map):
            statistic_map[action.player] = dict(emptystat)
         c1 = action.cards[0]
         c2 = action.cards[1]
         statistic_map[action.player]['total'] += 1
         if(c1[0] == c2[0]):
            statistic_map[action.player]['mononumber'] += 1
         if(c1[1] == c2[1]):
            statistic_map[action.player]['monocolor'] += 1
         if(c1[2] == c2[2]):
            statistic_map[action.player]['monoshape'] += 1
         if(c1[3] == c2[3]):
            statistic_map[action.player]['monoshading'] += 1

   return statistic_map

def aggregate_statistics(stats):
   agg = dict(emptystat)
   for stat in stats:
      for p in stat:
         agg[p] += stat[p]

   return agg

def table_name():
   return 'coefficient_stats'
