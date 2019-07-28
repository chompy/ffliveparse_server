import os
import json
import requests
import csv
import re
import time

CSV_FILE = "action.csv"
DESC_CSV_FILE = "action_desc.csv"
ICON_URL_FORMAT = "https://xivapi.com/i/%06d/%06d.png"
ICON_PATH = "icons"

if not os.path.exists(ICON_PATH):
    os.mkdir(ICON_PATH)

# fetch and parse action descriptions
actionDescs = {}
with open(DESC_CSV_FILE, "r") as descCsvFile:
    csvReader = csv.reader(descCsvFile)
    for row in csvReader:
        if not str(row[0]).isnumeric() or len(row) < 2:
            continue
        actionDescs[int(row[0])] = re.sub('<.*?>.*?<\/.*?>', '', row[1])

# fetch and parse action data
with open(CSV_FILE, "r") as csvFile:
    csvReader = csv.reader(csvFile)
    output = {}
    for row in csvReader:

        if not str(row[0]).isnumeric() or len(row) < 2:
            continue

        actionId = int(row[0])
        name = str(row[1]).strip()
        if not name: continue
        details = {
            "name_en"           : name,
            "help_en"           : actionDescs[actionId],
            "cast"              : int(row[38]) / 10,
            "cooldown"          : int(row[39]) / 10
        }       
        # download icon
        iconId = int(row[3])
        iconIdRange = int(iconId / 1000) * 1000
        iconSavePath = os.path.join(ICON_PATH, "%s.png" % iconId)
        if not os.path.exists(iconSavePath):
            r = requests.get(ICON_URL_FORMAT % (iconIdRange, iconId), stream=True)
            if r.status_code != 200:
                print("error, failed to fetch icon")
                continue
            with open(iconSavePath, 'wb') as f:
                for chunk in r:
                    f.write(chunk)
            time.sleep(1)
        # make icon url path
        details["icon"] = "/%s/%s.png" % (ICON_PATH.strip("/"), iconId)
        output[actionId] = details

    # dump to json file
    with open("actions.json", "w") as f:
        json.dump(output, f)