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
 * Trigger widget
 */
class WidgetTrigger extends WidgetBase
{

    constructor()
    {
        super();
        this.currentZone = "";
        this.logLineCount = 0;
        this.updateTriggerDetailsTimeout = null;
        if (!("triggers" in this.userConfig)) {
            this.userConfig["triggers"] = [];
            this._saveUserConfig()
        }
    }

    getName()
    {
        return "trigger";
    }

    getTitle()
    {
        return "Custom Triggers";
    }

    getOptions()
    {
        var options = super.getOptions();
        var t = this;
        options.push(
            new WidgetOption(
                "Configuration",
                "/static/img/opt_config.png",
                function() { t.showOptionConfig(); }
            )
        )
        return options;
    }

    add()
    {
        super.add()
        var bodyElement = this.getBodyElement();
        if (!bodyElement) {
            return;
        }
        var triggerDetailsElement = document.createElement("div");
        triggerDetailsElement.classList.add("triggerDetails");
        triggerDetailsElement.innerText = "Loading...";
        bodyElement.appendChild(triggerDetailsElement);

        var triggerContainerElement = document.createElement("div");
        triggerContainerElement.classList.add("triggerContainer");
        bodyElement.appendChild(triggerContainerElement);
        // hook events
        var t = this;
        this.addEventListener("act:encounter", function(e) { t._processEncounter(e); });
        this.addEventListener("act:logLine", function(e) { t._processLogLine(e); });
        // display trigger details
        this._updateTriggerDetails();
    }

    remove()
    {
        super.remove();
        if (this.updateTriggerDetailsTimeout) {
            clearTimeout(this.updateTriggerDetailsTimeout);
        }
        this.currentZone = "";
        this.logLineCount = 0;
        this.updateTriggerDetailsTimeout = null
    }
    
    showOptionHelp()
    {
        var helpText ="";
        helpText += "--- Custom Triggers Widget ---\n";
        helpText += "Supports ACT XML triggers with TTS.";
        alert(helpText);
    }

    showOptionConfig()
    {
        var t = this;
        Modal.open();
        Modal.reset();
        Modal.addSection("Triggers");
        for (var i in this.userConfig["triggers"]) {
            var trigger = this.userConfig["triggers"][i];
            Modal.addCheckbox(
                "trigger-" + i,
                "[" + trigger.category + "] " + trigger.message + " (" + trigger.regex + ")"
            );
        }
        if (this.userConfig["triggers"].length == 0) {
            Modal.addText("(no triggers)");
        }
        Modal.addButtons(
            {
                "deleteSelected"    : "Delete Selected",
                "deleteAll"         : "Delete ALL"
            },
            function(name) {
                t._triggerButtonPress(name);
            }
        )
        Modal.addSection("XML Import");
        Modal.addTextArea("xmlText")
        Modal.addButtons(
            {
                "addXml" : "Import"
            },
            function(e) {
                t._importXml(
                    Modal.getModalBodyElement().getElementsByClassName("modalTextArea-xmlText")[0].getElementsByTagName("textarea")[0].value
                );
            }
        );
    }

    /**
     * Process a log line event.
     * @param {Event} event 
     */
    _processLogLine(event)
    {
        this.logLineCount++;
        for (var i in this.userConfig["triggers"]) {
            var trigger = this.userConfig["triggers"][i];
            // restrict trigger to specific zone
            if (trigger.restrictZone && this.currentZone != trigger.category) {
                continue;
            }
            // check regex
            if (event.detail.LogLine.match(trigger.regex)) {
                this._addTriggerMessage(trigger.message);
            }
        }
    }

    /**
     * Process a encounter event.
     * @param {Event} event 
     */
    _processEncounter(event)
    {
        this.currentZone = event.detail.Zone;
    }

    /**
     * Add new trigger message, display and speak it.
     * @param {string} message 
     */
    _addTriggerMessage(message)
    {
        var triggerItemElement = document.createElement("div");
        triggerItemElement.classList.add("triggerItem");
        var triggerItemIconElement = document.createElement("div");
        triggerItemIconElement.classList.add("triggerItemIcon");
        var triggerItemIconImageElement = document.createElement("img");
        triggerItemIconImageElement.src = "/static/img/ico_speak.png";
        triggerItemIconImageElement.alt = "Trigger Display";
        var triggerItemMessageElement = document.createElement("div");
        triggerItemMessageElement.classList.add("triggerItemMessage")
        triggerItemMessageElement.innerText = message;
        triggerItemIconElement.appendChild(triggerItemIconImageElement);
        triggerItemElement.appendChild(triggerItemIconElement);
        triggerItemElement.appendChild(triggerItemMessageElement);
        this.getBodyElement().getElementsByClassName("triggerContainer")[0].appendChild(triggerItemElement);
        var u = new SpeechSynthesisUtterance(message);
        speechSynthesis.speak(u);
        u.addEventListener("end", function() {
            setTimeout(function() {
                triggerItemElement.remove();
            }, 5000);
        });
    }

    /**
     * Import XML trigger from ACT.
     * @param {string} xml 
     */
    _importXml(xml)
    {
        var xmlDoc;
        var parser = new DOMParser();
        try {
            // parse xml
            var xmlDoc = parser.parseFromString(xml, "text/xml");
            var triggerType = xmlDoc.firstChild.getAttribute("ST");
            if (triggerType != 3) {
                alert("Only TTS triggers are supported at this time.");
                return
            }
            var regex = xmlDoc.firstChild.getAttribute("R");
            var message = xmlDoc.firstChild.getAttribute("SD");
            var category = xmlDoc.firstChild.getAttribute("C");
            var restrictToZoneCategory = xmlDoc.firstChild.getAttribute("CR") == "T";
            // check if trigger already exists
            for (var i in this.userConfig["triggers"]) {
                var trigger = this.userConfig["triggers"][i];
                if (regex == trigger.regex && trigger.category == category && trigger.message == message) {
                    alert("Trigger already added.");
                    return;
                }
            }
            // add trigger
            this.userConfig["triggers"].push({
                "regex"         : regex,
                "type"          : "tts",
                "message"       : message,
                "category"      : category,
                "restrictZone"  : restrictToZoneCategory
            });
            console.log(">> Added trigger, ", this.userConfig["triggers"][this.userConfig["triggers"].length - 1]);
            this._saveUserConfig();
            this.showOptionConfig();
        } catch (e) {
            alert("Invalid XML snippet.");
            throw e;
        }
    }

    /**
     * Callback for button pressess
     * @param {string} name Button name
     */
    _triggerButtonPress(name)
    { 
        switch (name)
        {
            case "deleteSelected":
            {
                for (var i in this.userConfig["triggers"]) {
                    var checkboxElement = Modal.getModalBodyElement().getElementsByClassName("modalCheckbox-trigger-" + i)[0].getElementsByTagName("input")[0];
                    if (checkboxElement && checkboxElement.checked) {
                        this.userConfig["triggers"].splice(i, 1);
                    }
                }
                this._saveUserConfig();
                this.showOptionConfig();
                break;
            }
            case "deleteAll":
            {
                if (confirm("Are you sure you want to delete ALL your triggers?")) {
                    this.userConfig["triggers"] = [];
                    this._saveUserConfig();
                    this.showOptionConfig();
                }
                break;
            }
        }
    }

    /**
     * Display current details about triggers.
     */
    _updateTriggerDetails()
    {
        if (this.updateTriggerDetailsTimeout) {
            clearTimeout(this.updateTriggerDetailsTimeout);
        }
        var triggerMessage = "";
        triggerMessage += this.userConfig["triggers"].length;
        triggerMessage += " trigger(s) available. ";
        triggerMessage += this.logLineCount;
        triggerMessage += " log line(s) scanned.";
        this.getBodyElement().getElementsByClassName("triggerDetails")[0].innerText = triggerMessage;
        // run this every 5 seconds
        var t = this;
        this.updateTriggerDetailsTimeout = setTimeout(function() { t._updateTriggerDetails(); }, 5000);
    }

}