/*
This file is part of FFLiveParse.

FFLiveParse is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

FFLiveParse is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with FFLiveParse.  If not, see <https://www.gnu.org/licenses/>.
*/

var TRIGGER_KEY_ID = "i";
var TRIGGER_KEY_NAME = "n";
var TRIGGER_KEY_PARENT_ID = "p";
var TRIGGER_KEY_TRIGGER = "t";
var TRIGGER_KEY_ZONE = "z";
var TRIGGER_KEY_ACTION = "a";

class ViewTriggers extends ViewBase
{

    getName()
    {
        return "triggers";
    }

    getTitle()
    {
        return "Triggers"
    }

    init()
    {
        super.init();
        // create triggers in user config if not present
        if (!("triggers" in this.userConfig)) {
            this.userConfig["triggers"] = {};
            this.saveUserConfig();
        }
        // create name in user config if not present
        if (!("character_name" in this.userConfig)) {
            this.userConfig["character_name"] = "";
            this.saveUserConfig();
        }
        // create tts in user config if not present
        if (!("enable_tts" in this.userConfig)) {
            this.userConfig["enable_tts"] = true;
            this.saveUserConfig();
        }
        this.buildBaseElements();
        this.triggerTimeouts = [];
        this.reset();
        this.importStatusDiv.textContent = this.triggers.length + " trigger(s) loaded."
    }

    reset()
    {
        console.log(">> Trigger, reset.");
        // cancel all trigger timeouts
        for (var i in this.triggerTimeouts) {
            clearTimeout(this.triggerTimeouts[i]);
        }
        this.logLineQueue = [];
        this.triggerTimeouts = [];
        this.triggerVariables = {};
        this.triggerList = null;
        // (re)load triggers
        this.loadTriggers();
    }

    buildBaseElements()
    {
        var element = this.getElement();
        // import text area
        var importDiv = document.createElement("div");
        importDiv.classList.add("trigger-import");
        var importTextarea = document.createElement("textarea");
        importTextarea.setAttribute("placeholder", "Paste triggers here");
        importDiv.appendChild(importTextarea);
        this.importStatusDiv = document.createElement("div");
        this.importStatusDiv.classList.add("trigger-import-status");
        this.importStatusDiv.textContent = "Loading..."
        importDiv.appendChild(this.importStatusDiv)
        element.appendChild(importDiv);

        // trigger config area
        var triggerConfigDiv = document.createElement("div");
        triggerConfigDiv.classList.add("trigger-config");

        var triggerSelectAllDiv = document.createElement("div")
        triggerSelectAllDiv.classList.add("trigger-config-select-all", "trigger-config-input");
        this.triggerSelectAllInput = document.createElement("input");
        this.triggerSelectAllInput.type = "checkbox";
        this.triggerSelectAllInput.title = "Select All";
        triggerSelectAllDiv.appendChild(this.triggerSelectAllInput);
        triggerConfigDiv.appendChild(triggerSelectAllDiv);

        var triggerNameDiv = document.createElement("div");
        triggerNameDiv.classList.add("trigger-config-name", "trigger-config-input");
        var triggerNameInput = document.createElement("input");
        triggerNameInput.type = "text";
        triggerNameInput.placeholder = "Character Name";
        triggerNameInput.title = "Character Name";
        triggerNameInput.value = this.userConfig["character_name"];
        triggerNameDiv.appendChild(triggerNameInput);
        triggerConfigDiv.appendChild(triggerNameDiv);

        var triggerTtsDiv = document.createElement("div");
        triggerTtsDiv.classList.add("trigger-config-tts", "trigger-config-input");
        var triggerTtsCheckbox = document.createElement("input");
        triggerTtsCheckbox.type = "checkbox"
        triggerTtsCheckbox.title = "Enable Text-to-speech";
        if (this.userConfig["enable_tts"]) {
            triggerTtsCheckbox.checked = true;
        }
        triggerTtsCheckbox.setAttribute("id", "trigger-config-tts-checkbox");
        var triggerTtsLabel = document.createElement("label");
        triggerTtsLabel.innerText = "Enable TTS";
        triggerTtsLabel.title = "Enable Text-to-speech";
        triggerTtsLabel.setAttribute("for", triggerTtsCheckbox.id);
        
        triggerTtsDiv.appendChild(triggerTtsCheckbox);
        triggerTtsDiv.appendChild(triggerTtsLabel);
        triggerConfigDiv.appendChild(triggerTtsDiv);
        element.appendChild(triggerConfigDiv);

        // trigger list area
        this.triggerListDiv = document.createElement("div");
        this.triggerListDiv.classList.add("trigger-list");
        element.appendChild(this.triggerListDiv);
        this.triggerListEmptyDiv = document.createElement("div");
        this.triggerListEmptyDiv.classList.add("trigger-list-empty");
        this.triggerListEmptyDiv.innerText = "(no triggers loaded)";
        this.triggerListDiv.appendChild(this.triggerListEmptyDiv);

        this.triggerDeleteBtn = document.createElement("button");
        this.triggerDeleteBtn.innerText = "Delete Selected";

        this.triggerExportBtn = document.createElement("button");
        this.triggerExportBtn.innerText = "Export Selected";

        // add trigger(s) on paste
        var t = this;
        importTextarea.addEventListener(
            "paste",
            function(e) {
                setTimeout(function() {
                    try {
                        t.importTriggers(importTextarea.value);
                    } catch (exception) {
                        console.log(">> Trigger, import error,", exception);
                        t.importStatusDiv.innerText = "ERROR: " + exception;
                    }
                    importTextarea.value = "";
                }, 100);
            }
        )
        importTextarea.addEventListener(
            "keyup",
            function(e) {
                setTimeout(function() {
                    importTextarea.value = "";
                }, 200);
                
            }
        );
        // delete selected triggers
        var getSelectedIds = function() {
            var triggerListElements = t.triggerListDiv.getElementsByClassName("trigger-list-element");
            var selectedIds = [];
            for (var i = 0; i < triggerListElements.length; i++) {
                var element = triggerListElements[i];
                var inputElement = element.getElementsByTagName("input")[0];
                if (inputElement.checked) {
                    selectedIds.push(element.getAttribute("data-trigger-id"));
                }
            }
            return selectedIds;
        };
        this.triggerDeleteBtn.addEventListener(
            "click",
            function(e) {
                var deleteIds = getSelectedIds();
                if (deleteIds.length > 0) {
                    t.deleteTriggers(deleteIds);
                }
            }
        );
        // export selected triggers
        this.triggerExportBtn.addEventListener(
            "click",
            function(e) {
                var exportIds = getSelectedIds();
                if (exportIds.length > 0) {
                    t.exportTriggers(exportIds);
                }
            }
        );
        // save character name
        triggerNameInput.addEventListener("change", function(e) {
            t.userConfig["character_name"] = triggerNameInput.value;
            t.saveUserConfig();
            t.loadTriggers();
        });
        // enable/disable tts
        triggerTtsCheckbox.addEventListener("change", function(e) {
            t.userConfig["enable_tts"] = triggerTtsCheckbox.checked;
            t.saveUserConfig();
        });
        // select all
        this.triggerSelectAllInput.addEventListener("change", function(e) {
            var checkboxes = t.triggerListDiv.getElementsByTagName("input");
            for (var i = 0; i < checkboxes.length; i++) {
                checkboxes[i].checked = t.triggerSelectAllInput.checked;
            }
        });
    }

    /**
     * Add new trigger(s).
     * @param {*} data 
     */
    importTriggers(data)
    {
        // parse trigger(s)
        if (typeof(data) == "string") {
            try {
                data = this.convertFFTriggerData(data);
            } catch (e) {
                try {
                    data = this.convertActXML(data);
                } catch (e) {
                    if (i == 1) {
                        throw "Could not parse trigger data.";
                    }
                }
            }
        }
        // convert to array
        if (!Array.isArray(data)) {
            data = [data];
        }
        // itterate triggers
        let importNewCount = 0;
        let importUpdateCount = 0;
        for (let i in data) {
            let trigger = null;
            try {
                trigger = new Trigger(this.convertTrigger(data[i]));
            } catch (e) {
                console.log(">> Trigger, import error,", e);
                continue;                 
            }

            if (trigger.getUid() in this.userConfig["triggers"]) {
                importUpdateCount++;
            } else {
                importNewCount++
            }
            this.userConfig["triggers"][trigger.getUid()] = data[i];
            console.log(">> Trigger, imported '" + trigger.getUid() + ".'");
        }
        this.importStatusDiv.innerText = "";
        if (importNewCount > 0) {
            this.importStatusDiv.innerText = "Added " + importNewCount + " trigger(s). ";
        }
        if (importUpdateCount > 0) {
            this.importStatusDiv.innerText = "Updated " + importUpdateCount + " trigger(s).";
        }
        // save user config
        this.saveUserConfig();
        // reset triggers
        this.loadTriggers();
    }

    /**
     * Delete given trigger id and all its children.
     * @param {array} triggerIds
     */
    deleteTriggers(triggerIds)
    {
        if (typeof(triggerIds) != "object") {
            triggerIds = [triggerIds];
        }
        var deleteIndexes = [];
        for (var i in this.triggers) {
            var trigger = this.triggers[i];
            if (triggerIds.indexOf(trigger.getUid()) != -1) {
                if (deleteIndexes.indexOf(i) == -1) {
                    deleteIndexes.push(i);
                }
                for (var j in this.triggers) {
                    if (this.triggerIsChildOf(this.triggers[j], trigger)) {
                        if (deleteIndexes.indexOf(j) == -1) {
                            deleteIndexes.push(j);
                        }
                    }
                }
            }
        }
        if (confirm("This will delete " + deleteIndexes.length + " trigger(s), are you sure?")) {
            var rebuildTriggers = {};
            for (var tid in this.userConfig["triggers"]) {
                var isDelete = false;
                for (var i in deleteIndexes) {
                    if (this.triggers[deleteIndexes[i]].getId() == tid) {
                        isDelete = true;
                        break;
                    }
                }
                if (!isDelete) {
                    rebuildTriggers[tid] = this.userConfig["triggers"][tid];
                }
            }
            this.userConfig["triggers"] = rebuildTriggers;
            this.saveUserConfig();
            this.loadTriggers();
        }
    }

    exportTriggers(triggerIds)
    {
        if (typeof(triggerIds) != "object") {
            triggerIds = [triggerIds];
        }
        var exportIndexes = [];
        for (var i in this.triggers) {
            var trigger = this.triggers[i];
            if (triggerIds.indexOf(trigger.getUid()) != -1) {
                if (exportIndexes.indexOf(i) == -1) {
                    exportIndexes.push(i);
                }
                var parentTriggerId = trigger.getParentId();
                while (parentTriggerId) {
                    for (var j in this.triggers) {
                        if (this.triggers[j].getId() == parentTriggerId) {
                            if (exportIndexes.indexOf(j) == -1) {
                                exportIndexes.push(j);
                            }
                            parentTriggerId = this.triggers[j].getParentId();
                        }
                    }
                }      
            }
        }
        var exportTriggerData = [];
        for (var i in exportIndexes) {
            exportTriggerData.push(
                this.triggers[exportIndexes[i]].data
            );
        }
        prompt(
            exportTriggerData.length + " trigger(s) exported...",
            LZString.compressToBase64(JSON.stringify(exportTriggerData))
        );
    }

    /**
     * Check if a trigger is a child of a given parent
     * @param {Trigger} child 
     * @param {Trigger} parent 
     * @return {boolean}
     */
    triggerIsChildOf(child, parent)
    {
        if (!child.getParentId()) {
            return false;
        }
        if (child.getParentId() == parent.getId()) {
            return true;
        }
        var parentIds = [child.getParentId()];
        for (var i in this.triggers) {
            var trigger = this.triggers[i];
            if (parentIds.indexOf(trigger.getUid()) != -1) {
                if (trigger.getParentId()) {
                    parentIds.push(trigger.getParentId());
                }
            }
        }
        return parentIds.indexOf(parent.getId()) != -1;
    }

    /**
     * Convert stored trigger to dict used by FFTrigger.
     * @param {Dict} data 
     * @return {Dict}
     */
    convertTrigger(data)
    {
        return {
            "name" : data[TRIGGER_KEY_NAME],
            "uid" : data[TRIGGER_KEY_ID],
            "log_regex" : data[TRIGGER_KEY_TRIGGER],
            "zone_regex" : data[TRIGGER_KEY_ZONE],
            "lua_script" : data[TRIGGER_KEY_ACTION],
            "tts_message" : "",
            "parent_id" : data[TRIGGER_KEY_PARENT_ID]
        };
    }

    /**
     * Load all triggers from local storage.
     */
    loadTriggers()
    {        
        // create trigger list object
        this.triggerList = new TriggerList(
            function(msg) {
                console.log(">> Trigger, log, ", msg);
            }
        );
        this.triggerList.setEncounterZone("*");
        if (this.userConfig["character_name"]) {
            this.triggerList.setMe({
                "name" : this.userConfig["character_name"],
                "job" : "WAR"
            });
        }

        // GET COMBATANT
        /*vm.realm.global.getCombatant = function(name) {
            return this.combatantCollector.find(name);
        };*/

        // load triggers with VM
        this.triggers = [];
        for (var tid in this.userConfig["triggers"]) {
            this.triggerList.addTrigger(
                this.convertTrigger(this.userConfig["triggers"][tid])
            );
        }
        console.log(">> Trigger, loaded " + this.triggerList.triggers.length + " triggers.");
        this.addTriggerElements();
    }

    addTriggerElements()
    {
        this.triggerListDiv.innerHTML = "";
        if (this.triggerList.triggers.length == 0) {
            this.triggerListDiv.appendChild(this.triggerListEmptyDiv);
            return;
        }
        this.triggerList.triggers.sort(function(a, b) {
            return a.getName().localeCompare(b.getName());
        });
        var t = this;
        var itterateLevels = function(parentTrigger, level) {
            for (var i in t.triggerList.triggers) {
                var trigger = t.triggerList.triggers[i];
                if (trigger.trigger.parent_id == parentTrigger.getUid()) {
                    t.addTriggerElement(trigger, level);
                    itterateLevels(trigger, level + 1);
                }
            }
        };
        for (var i in this.triggerList.triggers) {
            var trigger = t.triggerList.triggers[i];
            if (!trigger.trigger.parent_id) {
                this.addTriggerElement(trigger, 0);
                itterateLevels(trigger, 1);
            }
        }
        this.triggerListDiv.appendChild(this.triggerDeleteBtn);
        this.triggerListDiv.appendChild(this.triggerExportBtn);
        setTimeout(function(){ fflpFixFooter(); }, 500);
    }

    addTriggerElement(trigger, level)
    {
        var triggerElement = document.createElement("div");
        triggerElement.classList.add("trigger-list-element", "trigger-element-level-" + level)
        triggerElement.setAttribute("data-trigger-id", trigger.getUid());
        this.triggerListDiv.appendChild(triggerElement);

        var triggerSelectElement = document.createElement("input");
        triggerSelectElement.type = "checkbox";
        var elementId = "trigger-element-" + trigger.getUid().replace(/ /g, "-");
        triggerSelectElement.id = elementId;
        triggerElement.appendChild(triggerSelectElement);

        var triggerTreeElement = document.createElement("div");
        triggerTreeElement.classList.add("trigger-element-tree");
        triggerTreeElement.style.width = (level * 30) + "px";
        triggerElement.appendChild(triggerTreeElement);

        var triggerNameElement = document.createElement("div");
        triggerNameElement.classList.add("trigger-element-name");
        triggerElement.appendChild(triggerNameElement);

        var triggerNameLabelElement = document.createElement("label");
        triggerNameLabelElement.innerText = trigger.getName();
        triggerNameLabelElement.setAttribute("for", elementId);
        triggerNameElement.appendChild(triggerNameLabelElement);

        var t = this;
        triggerSelectElement.addEventListener("change", function(e) {
            t.triggerSelectAllInput.checked = false;
        });      
    }


    /**
     * Convert XML trigger from ACT.
     * @param {string} xml 
     */
    convertActXML(xml)
    {
        var xmlDoc;
        var parser = new DOMParser();
        // parse xml
        var xmlDoc = parser.parseFromString(xml, "text/xml");
        var triggerType = xmlDoc.firstChild.getAttribute("ST");
        if (triggerType != 3) {
            console.log(">> Trigger, XML import only supports TTS triggers.");
            this.importStatusDiv.innerText = "ERROR: Only TTS triggers are supported.";
            return
        }
        var regex = xmlDoc.firstChild.getAttribute("R");
        var message = xmlDoc.firstChild.getAttribute("SD");
        var category = xmlDoc.firstChild.getAttribute("C");
        var restrictToZoneCategory = xmlDoc.firstChild.getAttribute("CR") == "T";
        var triggersToAdd = [];
        // create parent trigger for category
        var categoryId = "";
        if (category) {
            var categoryId = "act-" + category;
            triggersToAdd.push({
                TRIGGER_KEY_ID   : categoryId,
                TRIGGER_KEY_NAME : category + " (ACT)"
            });
        }
        // fix match vars in message
        var actionMessage = message;
        for (var i = 0; i < 20; i++) {
            actionMessage = actionMessage.replace("$" + i, "\"+match[" + i + "]+\"");
        }
        var triggerId = regex.trim() + message.trim();
        triggerId = "act-" + triggerId.split("").reduce(function(a,b){a=((a<<5)-a)+b.charCodeAt(0);return a&a},0);
        // create trigger data object
        triggersToAdd.push({
            TRIGGER_KEY_ID   : triggerId,
            TRIGGER_KEY_NAME : regex.substring(0, 64) + 
                                (regex.length > 64 ? "... :: " : " :: ") +
                                message.substring(0, 64) +
                                (message.length > 64 ? "..." : "")
                        ,
            TRIGGER_KEY_PARENT_ID : categoryId,
            TRIGGER_KEY_TRIGGER   : regex,
            TRIGGER_KEY_ZONE      : restrictToZoneCategory ? category : "",
            TRIGGER_KEY_ACTION    : "say(\""+ actionMessage +"\")"
        });
        return triggersToAdd;
    }

    /**
     * Convert FFTrigger data.
     * @param {string} data 
     */
    convertFFTriggerData(data)
    {
        data = atob(data.trim());
        data = new TextDecoder("utf-8").decode(
            pako.inflate(data)
        );
        let sep = "╠";

        if (data.length == 0 || data[0] !=sep) {
            throw "Invalid FFTrigger data.";
        }
        data = data.split(sep);
        if (data.length != 7) {
            throw "Invalid FFTrigger data.";
        }
        let triggerId = data[1];
        let triggerName = data[2];
        let triggerRegex = data[3];
        let triggerZone = data[4];
        let triggerTts = data[5].trim();
        let triggerScript = data[6];        
        if (triggerTts) {
            triggerScript = "say(\"" + triggerTts + "\");\n" + triggerScript;
        }
        let triggersToAdd = [{
            [TRIGGER_KEY_ID]   : "fftriggers",
            [TRIGGER_KEY_NAME] : "FFTriggers"
        }];
        triggersToAdd.push({
            [TRIGGER_KEY_ID]   : triggerId,
            [TRIGGER_KEY_NAME] : triggerName,
            [TRIGGER_KEY_PARENT_ID] : "fftriggers",
            [TRIGGER_KEY_TRIGGER]   : triggerRegex,
            [TRIGGER_KEY_ZONE]      : triggerZone,
            [TRIGGER_KEY_ACTION]    : triggerScript
        });
        return triggersToAdd;
    }

    onLogLine(logLineData)
    {
        if (!this.ready) {
            return;
        }
        this.triggerList.onLogLine(logLineData.LogLine);
    }

    onEncounterActive(encounter)
    {
        this.reset();
        this.triggerList.setEncounterZone(encounter.data.Zone);
    }

    onEncounterInactive(encounter)
    {
        this.reset();
    }

}