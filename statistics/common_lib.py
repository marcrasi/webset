#
#Cards are stored as follows, in case you were wondering:
#[NUMBER, COLOR, SHAPE, SHADING]
#

#An action, along with useful metadata
#
#Useful metadata:
#  pickup_success -- whether the pickup actually worked
#     -> note that there are two reasons a pickup could fail
#        either it is not really a set or someone else has
#        already picked it up. maybe in future versions we
#        can put metadata distinguishing self if anyone cares
#
#  pickup_idxs -- if the pickup worked, which table idxs was it from?
class Action:
   def __gen_pickup_success(self, si, sf):
      if(self.action_type == 'pickup'):
         if all([(c in si.table) for c in self.cards]):
            if all([(not c in sf.table) for c in self.cards]):
               self.pickup_success = True
               return
         self.pickup_success = False

   def __gen_pickup_idxs(self, si, sf):
      if(self.action_type == 'pickup' and self.pickup_success):
         self.pickup_idxs = [si.table.index(c) for c in self.cards]

   def __genMetadata(self, si, sf):
      self.__gen_pickup_success(si, sf)
      self.__gen_pickup_idxs(si, sf)

   #Pass us the raw action along with the states before and after it
   #action: the action
   #si: the state before it
   #sf: the state after it
   def __init__(self, action, si, sf):
      if(not 'action_type' in action):
         self.action_type = 'none'
         return
      self.action_type = action['action_type']
      self.timestamp = action['timestamp']
      self.player = action['playerid']

      if(self.action_type == 'pickup'):
         self.cards = list(action['cards'])

      self.__genMetadata(si, sf)

class GameState:
   def __init__(self, other=None): 
      if(other==None):
         self.table = list()
         self.players = dict()
         self.everplayers = dict()
         self.game_start_timestamp = 0
      else:
         self.table = list(other.table)
         self.players = dict(other.players)
         self.everplayers = dict(other.everplayers)
         self.game_start_timestamp = other.game_start_timestamp

   def __applyCompleteUpdate(self, up):
      self.table = list(up['table'])
      self.players = dict(up['players'])
      self.everplayers = dict(up['players'])
      self.game_start_timestamp = up['game_start_timestamp']
      self.timestamp = up['game_start_timestamp']

   #do the table-update portion of the update
   #note that self function is carefully constructed to do the update in
   #exactly the same way that the JS client/servers do the update, so that
   #everyone always agrees about the positions of the cards
   def __applyStepUpdate_table(self, up):
      table = self.table

      #get fields from the update if they exist
      rm = []
      if('cards_removed' in up):
         rm = list(up['cards_removed'])
      add = []
      if('cards_added' in up):
         add = list(up['cards_added'])

      #First remove the cards that are to be removed
      holes = []
      for i in range(0,len(table)):
         if(table[i] in rm):
            table[i] = 0
            holes.append(i)

      #Next fill in all the holes that we made
      for i in holes:
         if(len(add)>0):
            table[i] = add[-1]
            add.pop()
         else:
            nonzeroidx = len(table)-1
            while(nonzeroidx > i and table[nonzeroidx] == 0):
               nonzeroidx -= 1;
            table[i] = table[nonzeroidx]
            table[nonzeroidx] = 0  

      #Pop off zeros at the end
      while(len(table)>0 and table[-1] == 0):
         table.pop();  

      #finally add cards that are left to add
      for card in add:
          table.append(card)

   def __applyStepUpdate_player(self, up):
      if('players_joined' in up):
         for j in up['players_joined']:
            if(j in self.everplayers):
               self.players[j] = self.everplayers[j]
            else:
               self.players[j] = 0
               self.everplayers[j] = 0

      if('players_left' in up):
         for l in up['players_left']:
            if l in self.players:
               del self.players[l]

      if('player_scoredeltas' in up):
         for p in up['player_scoredeltas']:
            if(p in self.players):
               self.players[p] += 1
               self.everplayers[p] += 1
            #else complain loudly, maybe

   def __applyStepUpdate(self, up):
      self.__applyStepUpdate_table(up)
      self.__applyStepUpdate_player(up)
      self.timestamp = up['timestamp']

   def applyUpdate(self, up):
      if(up['update_type']=='complete-update'):
         self.__applyCompleteUpdate(up)
      if(up['update_type']=='single-step'):
         self.__applyStepUpdate(up)

   #helper function for getAllSets
   #return a card that forms a set with c1 and c2
   def __addCards(self,c1, c2):
      return tuple([((2*c1[i]+2*c2[i])%3) for i in range(0,4)])

   #return a list whose elements are triples of table-idxs that form sets
   def getAllSets(self):
      table = self.table

      #first store all the cards that we have
      haveCards = {}
      for i in range(0,len(table)):
         haveCards[tuple(table[i])] = i

      #now iterate over all card pairs and check if they form a set
      allSets = []
      for i in range(0,len(table)):
         for j in range(i+1,len(table)):
            if(self.__addCards(table[i],table[j]) in haveCards):
               k = haveCards[self.__addCards(table[i],table[j])]
               if(k > j):
                  allSets.append((i,j,k))

      return set(allSets)

#actionList[i] is the action that moves us from stateList[i] to
#stateList[i+1]
class SetGame:
   def __processGame(self, game):

      #add all the states to the state list
      self.stateList = []
      nextState = None
      for i in range(0,len(game['updates'])):
         nextState = GameState(nextState)
         nextState.applyUpdate(game['updates'][i])
         self.stateList.append(nextState)

      #add all the actions to the action list
      self.actionList = []
      for i in range(1,len(game['actions'])): #why we start at 1 is mystery to
                                              #be figured out later
         rawaction = game['actions'][i][0] #note nastiness 
         action = Action(rawaction, self.stateList[i], \
            self.stateList[i+1])
         self.actionList.append(action)
       
   def __init__(self, game):
      self.__processGame(game)
