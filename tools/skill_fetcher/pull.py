import os
import json
import requests 

API_URL = "https://api.xivdb.com/action?columns=id,name_ja,name_en,name_fr,name_de,name_cns,lodestone_id,lodestone_type,help_ja,help_en,help_fr,help_de,help_cns,json_ja,json_en,json_fr,json_de,json_cns,icon,level,classjob_category,classjob,spell_group,can_target_self,can_target_party,can_target_friendly,can_target_hostile,can_target_dead,status_required,status_gain_self,cost,cost_hp,cost_mp,cost_tp,cost_cp,cast_range,cast_time,recast_time,is_in_game,is_trait,is_pvp,is_target_area,action_category,action_combo,action_proc_status,action_timeline_hit,action_timeline_use,action_data,effect_range,type"
ICON_URL_FORMAT = "https://secure.xivdb.com/img/game/%06d/%06d.png"
ICON_PATH = "icons"

# fetch skil list
r = requests.get(url = API_URL) 
skillList = r.json()

# make icon output directory
if not os.path.exists(ICON_PATH): os.mkdir(ICON_PATH)

# build list of skill
output = {}
for item in skillList:
    # make sure skill id exists
    skillId = item.get("id", None)
    if not skillId: continue
    # log skill download in process
    print("%s (%d)..." % (item.get("name_en", item.get("id")), skillId), end="")
    # skill must be related to a job/class
    if item.get("classjob") <= 0 and item.get("classjob_category") <= 0:
        print("skipped")
        continue
    # make sure icon exists
    if not item.get("icon"):
        print("error, no icon found")
        continue
    # download icon
    iconId = int(item.get("icon"))
    iconIdRange = int(iconId / 1000) * 1000
    r = requests.get(ICON_URL_FORMAT % (iconIdRange, iconId), stream=True)
    if r.status_code != 200:
        print("error, failed to fetch icon")
        continue
    with open(os.path.join(ICON_PATH, "%s.png" % skillId), 'wb') as f:
        for chunk in r:
            f.write(chunk)
    # make icon url path
    item["icon"] = "/%s/%s.png" % (ICON_PATH.strip("/"), skillId)
    # add ouptut
    output[skillId] = item
    # done
    print("done")

# dump to json file
with open("actions_full.json", "w") as f:
    json.dump(output, f)