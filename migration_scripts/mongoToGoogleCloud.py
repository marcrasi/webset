import math
import numbers
import random
import json
from google.cloud import datastore
import pymongo
from pymongo import MongoClient
from concurrent.futures import ThreadPoolExecutor
from bson import ObjectId

def mongo_to_entity(document, entity):
    for attr in document:
        if attr != '_id':
            value = document[attr]
            if isinstance(value, dict):
                value_entity = datastore.entity.Entity()
                mongo_to_entity(value, value_entity)
                entity[attr] = value_entity
            elif isinstance(value, bool) or math.isnan(value):
                entity[attr] = value
            elif isinstance(value, numbers.Real):
                entity[attr] = int(value)
            else:
                entity[attr] = value

with open('../application_config.json', 'r') as f:
    config = json.load(f)

connection = MongoClient('mongodb://' + config['mongoServer'] + 'set-game', 27017)
db = connection['set-game']

client = datastore.client.Client()

def migrate_collection(collection_name, make_key, transformation):
    print 'migrating %s' % collection_name
    with ThreadPoolExecutor(max_workers=50) as executor:
        def handle_document(document):
            print '%s: %s' % (collection_name, document['_id'])
            key = make_key(document)
            entity = datastore.entity.Entity(key)
            transformation(document)
            mongo_to_entity(document, entity)
            client.put(entity)

        documents = db[collection_name].find().sort('_id', pymongo.ASCENDING)
        executor.map(handle_document, documents)

def unspecified_key(entity_kind):
    def inner(document):
        return client.key(entity_kind)
    return inner

def identity_transformation(document):
    pass

def statistic_key(entity_kind):
    def inner(document):
        return client.key(entity_kind, document['username'] + '~' + document['game_type'])
    return inner

def statistic_transformation(document):
    document['statistic'] = json.dumps(document['statistic'])

def ranked_deck_transformation(document):
    document['deck'] = json.dumps(document['deck'])

def ss_results_key(entity_kind):
    def inner(document):
        return client.key(entity_kind, document['username'] + '~' + document['date'])
    return inner

migrate_collection('users', unspecified_key('User'), identity_transformation)
migrate_collection('coefficient_stats', statistic_key('CoefficientStat'), statistic_transformation)
migrate_collection('heat_map_stats', statistic_key('HeatMapStat'), statistic_transformation)
migrate_collection('ss_practice_results', unspecified_key('SSPracticeResult'), identity_transformation)
migrate_collection('ss_ranked_decks', unspecified_key('SSRankedDeck'), ranked_deck_transformation)
migrate_collection('ss_ranked_results', ss_results_key('SSRankedResult'), identity_transformation)

print 'migrating games'
total = 0
def handle_documents(documents):
    global total
    with ThreadPoolExecutor(max_workers=50) as executor:
        client = datastore.client.Client()

        def handle_document(document):
            game_log_id = str(int(document['timestamp'])) + '-' + str(random.randrange(0, 1000000))

            game_log = dict(document)
            del game_log['_id']
            del game_log['stats_processed']

            with open('games/' + game_log_id + '.json', 'w') as f:
                f.write(json.dumps(game_log))

            key = client.key('GameLogMetadata', game_log_id)
            game_log_metadata = dict(document)
            del game_log_metadata['actions']
            del game_log_metadata['updates']
            if 'par' in game_log_metadata and 'fixed_deck' in game_log_metadata['par']:
                del game_log_metadata['par']['fixed_deck']
            try:
                entity = datastore.entity.Entity(key)
                mongo_to_entity(game_log_metadata, entity)
                client.put(entity)
            except Exception as e:
                print 'failure on %s, %s' % (document['_id'], str(game_log_metadata))
                raise e

            return True

        if len(documents) > 0:
            print 'Handling %d documents (first is %s, last is %s)' % (len(documents), documents[0]['_id'], documents[-1]['_id'])
            executor.map(handle_document, documents)
            total += len(documents)
            print 'Processed %d' % total

documents = []
cursor = db.games.find().sort('_id', pymongo.ASCENDING).batch_size(200)
for document in cursor:
    documents.append(document)
    if len(documents) == 200:
        handle_documents(documents)
        documents = []
handle_documents(documents)
documents = []

print 'done'
