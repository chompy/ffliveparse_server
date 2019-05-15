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

/**
 * A single processable trigger.
 */
class Trigger
{

    /**
     * Constructor.
     * @param {string|object} data
     * @param {Vm} vm
     */
    constructor(data, vm)
    {
        // convert data json string to object
        if (typeof(data) == "string") {
            data = JSON.parse(data);
        }
        // only accept one trigger per trigger object
        if (Array.isArray(data)) {
            data = data[0];
        }
        this.data = data;
        this.vm = vm;
        // slugify id
        this.id  = this.data["i"] = this.get("i")
            .toLowerCase()
            .replace(/ /g,'-')
            .replace(/[^\w-]+/g,'')
        ;
        this.parentId = this.data["p"] = this.get("p")
            .toLowerCase()
            .replace(/ /g,'-')
            .replace(/[^\w-]+/g,'')
        ;        
        // compile trigger regex
        this.regex = null;
        if (this.getTrigger()) {
            this.regex = new XRegExp(this.getTrigger(), "gm");
        }
        this.enabled = true;
    }

    /**
     * Get data value.
     * @param {string} key
     * @return {string}
     */
    get(key)
    {
        if (key in this.data) {
            return this.data[key];
        }
        return "";
    }

    /**
     * @return {boolean}
     */
    isValid()
    {
        // must have id
        return this.get("i");
    }

    /**
     * @return {string}
     */
    getId()
    {
        return this.id;
    }

    /**
     * @return {string}
     */
    getName()
    {
        var name = this.get("n");
        if (!name) {
            name = this.getId();
        }
        return name;
    }

    /**
     * @return {string}
     */
    getParentId()
    {
        return this.parentId;
    }

    /**
     * @return {string}
     */
    getZone()
    {
        return this.get("z");
    }

    /**
     * @return {string}
     */
    getTrigger()
    {
        return this.get("t");
    }

    /**
     * @return {string}
     */
    getAction()
    {
        return this.get("a");
    }

    /**
     * Check trigger against a log line.
     * @param {LogLine} logLine
     * @param {string} currentZone
     * @return {boolean} True if log line matched
     */
    onLogLine(logLine, currentZone)
    {
        if (!this.regex) {
            return false;
        }
        if (this.getZone() && currentZone && this.getZone() != currentZone) {
            return false;
        }
        var match = logLine.LogLine.match(this.regex);
        if (!match) {
            return false;
        }
        console.log(">> Trigger, '" + this.getId() + "' matched log line event.");
        this.vm.realm.global.match = match;
        this.vm.realm.global.logLine = logLine;
        this.performAction();
        this.vm.realm.global.match = null;
        this.vm.realm.global.logLine = null;
        return true;
    }

    /**
     * Perform action.
     */
    performAction()
    {
        if (!this.enabled) {
            return;
        }
        if (this.getAction()) {
            this.vm.realm.global.triggerId = this.getId();
            this.vm.realm.global.triggerZone = this.getZone();
            this.vm.realm.global.triggerRegex = this.getTrigger();
            this.vm.eval(this.getAction());
        }
    }
}

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
        this.zoneName = "";
        this.buildBaseElements();
        // create triggers in user config if not present
        if (!("triggers" in this.userConfig)) {
            this.userConfig["triggers"] = {};
            this.saveUserConfig();
        }
        this.triggerTimeouts = [];
        this.reset();
        this.importStatusDiv.textContent = this.triggers.length + " trigger(s) loaded."
    }

    reset()
    {
        // cancel all trigger timeouts
        for (var i in this.triggerTimeouts) {
            clearTimeout(this.triggerTimeouts[i]);
        }
        this.triggerTimeouts = [];
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
                        t.addTriggers(importTextarea.value);
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
    }

    /**
     * Add new trigger(s).
     * @param {*} data 
     */
    addTriggers(data)
    {
        // parse trigger(s)
        if (typeof(data) == "string") {
            try {
                data = JSON.parse(data);
            } catch (e) {
                try {
                    data = this.convertActXML(data);
                } catch (e) {
                    throw "Could not parse trigger data.";
                }
            }
        }
        // convert to array
        if (!Array.isArray(data)) {
            data = [data];
        }
        // itterate triggers
        for (var i in data) {
            var trigger = new Trigger(data[i], new Vm());
            if (!trigger.isValid()) {
                console.log(">> Trigger, import error, tried to import trigger without an ID (i).")
                continue; 
            }
            this.userConfig["triggers"][trigger.getId()] = trigger.data;
            console.log(">> Trigger, imported '" + trigger.getId() + ".'");
        }
        this.importStatusDiv.innerText = "Imported " + data.length + " trigger(s).";
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
            if (triggerIds.indexOf(trigger.getId()) != -1) {
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
            if (triggerIds.indexOf(trigger.getId()) != -1) {
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
            JSON.stringify(exportTriggerData)
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
        var childParentId = child.getParentId();
        while (childParentId) {
            // found parent
            if (childParentId == parent.getId()) {
                return true;
            }
            for (var i in this.triggers) {
                if (this.triggers[i].getId() == childParentId) {
                    childParentId = this.triggers[i].getParentId();
                }
            }
        }
        return false;
    }

    loadTriggers()
    {        
        // create trigger condition+action vm
        var t = this;
        var vm = new Vm();
        var triggerFuncTimeout = function(func, delay) {
            var delay = parseInt(delay ? delay : 1);
            if (isNaN(delay)) {
                delay = 1;
            }
            t.triggerTimeouts.push(
                setTimeout(func, delay)
            );
        };
        var triggerEnable = function(tid, enable) {
            for (var i in t.triggers) {
                var trigger = t.triggers[i];
                if (trigger.getId() == tid) {
                    trigger.enabled = enable;
                    for (var j in t.triggers) {
                        if (t.triggerIsChildOf(t.triggers[j], trigger)) {
                            t.triggers[j].enabled = enable;
                        }
                    }

                }
            }            
        }
        // SAY
        vm.realm.global.say = function(text, delay) {
            var text = text;
            triggerFuncTimeout(
                function() {
                    var msg = new SpeechSynthesisUtterance(text);
                    window.speechSynthesis.speak(msg);      
                },
                delay
            );      
        };
        // DO
        vm.realm.global.do = function(tid, delay) {
            var tid = tid;
            triggerFuncTimeout(
                function() {
                    for (var i in t.triggers) {
                        var trigger = t.triggers[i];
                        if (trigger.getId() == tid) {
                            return trigger.performAction();
                        }
                    }
                },
                delay
            );
        };
        // ENABLE
        vm.realm.global.enable = function(tid, delay) {
            var tid = tid;
            triggerFuncTimeout(
                function() {
                    triggerEnable(tid, true);
                },
                delay
            );
        };
        // DISABLE
        vm.realm.global.disable = function(tid, delay) {
            var tid = tid;
            triggerFuncTimeout(
                function() {
                    triggerEnable(tid, false);
                },
                delay
            );
            
        };
        // GET COMBATANT
        vm.realm.global.getCombatant = function(name) {
            return this.combatantCollector.find(name);
        };
        // NAME SHORTIFY
        vm.realm.global.nameShortify = function(name) {
            name = name.trim().split(" ");
            return name[0];
        };
        // PARSE LOG LINE
        vm.realm.global.parseLogLine = function(logLine) {
            if (typeof(logLine) == "object") {
                logLine = logLine.LogLine;
            }
            return parseLogLine(logLine);
        };
        // load triggers with VM
        this.triggers = [];
        for (var tid in this.userConfig["triggers"]) {
            var trigger = new Trigger(this.userConfig["triggers"][tid], vm);
            if (!trigger.isValid()) {
                continue;
            }
            this.triggers.push(trigger);
        }
        console.log(">> Trigger, loaded " + this.triggers.length + " triggers.");
        this.addTriggerElements();
    }

    addTriggerElements()
    {
        this.triggerListDiv.innerHTML = "";
        if (this.triggers.length == 0) {
            this.triggerListDiv.appendChild(this.triggerListEmptyDiv);
            return;
        }
        this.triggers.sort(function(a, b) {
            return a.getName().localeCompare(b.getName());
        });
        var t = this;
        var itterateLevels = function(parentTrigger, level) {
            for (var i in t.triggers) {
                var trigger = t.triggers[i];
                if (trigger.getParentId() == parentTrigger.getId()) {
                    t.addTriggerElement(trigger, level);
                    itterateLevels(trigger, level + 1);
                }
            }
        };
        for (var i in this.triggers) {
            var trigger = t.triggers[i];
            if (!trigger.getParentId()) {
                this.addTriggerElement(this.triggers[i], 0);
                itterateLevels(trigger, 1);
            }
        }
        this.triggerListDiv.appendChild(this.triggerDeleteBtn);
        this.triggerListDiv.appendChild(this.triggerExportBtn);
    }

    addTriggerElement(trigger, level)
    {
        var triggerElement = document.createElement("div");
        triggerElement.classList.add("trigger-list-element", "trigger-element-level-" + level)
        triggerElement.setAttribute("data-trigger-id", trigger.getId());
        this.triggerListDiv.appendChild(triggerElement);

        var triggerSelectElement = document.createElement("input");
        triggerSelectElement.type = "checkbox";
        var elementId = "trigger-element-" + trigger.getId().replace(/ /g, "-");
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
                "i"         : categoryId,
                "n"         : category + " (ACT)"
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
            "i"         : triggerId,
            "n"         : regex.substring(0, 64) + 
                                (regex.length > 64 ? "... :: " : " :: ") +
                                message.substring(0, 64) +
                                (message.length > 64 ? "..." : "")
                        ,
            "p"         : categoryId,
            "t"         : regex,
            "z"         : restrictToZoneCategory ? category : "",
            "a"         : "say(\""+ actionMessage +"\");"
        });
        return triggersToAdd;
    }

    onLogLine(logLineData)
    {
        if (!this.ready) {
            return;
        }
        for (var i in this.triggers) {
            this.triggers[i].onLogLine(logLineData, this.currentZone)
        }
    }

    onEncounter(encounter)
    {
        this.zoneName = encounter.data.Zone;
    }

}