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
 * Skill timer widget
 */
class WidgetSkilltimer extends WidgetBase
{

    constructor()
    {
        super();
        this.encounterId = "";
        this.data = null;
        this.tickTimeout = null;
        if (!("skills" in this.userConfig)) {
            this.userConfig["skills"] = [
                "chain-stratagem", "trick-attack", "embolden", "brotherhood", "battle-litany", 
                "devotion", "balance", "arrow", "spear", 
            ];
            this._saveUserConfig()
        }
        if (!("alertActivation" in this.userConfig)) {
            this.userConfig["alertActivation"] = true;
            this._saveUserConfig()
        }
        if (!("alertOffCooldown" in this.userConfig)) {
            this.userConfig["alertOffCooldown"] = false;
            this._saveUserConfig()
        }
    }

    getName()
    {
        return "skilltimer";
    }

    getTitle()
    {
        return "Skill Timer";
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

        // container element
        var skillContainerElement = document.createElement("div");
        skillContainerElement.classList.add("skillTimerContainer");
        bodyElement.appendChild(skillContainerElement);

        // no active skills element
        var noActiveSkillElement = document.createElement("div");
        noActiveSkillElement.classList.add("noActiveSkills");
        noActiveSkillElement.innerText = "(no active skills)";
        skillContainerElement.appendChild(noActiveSkillElement);

        // fetch data
        this._fetchData();

        // hook events
        var t = this;
        this.addEventListener("act:encounter", function(e) { t._onEncounter(e); });
        this.addEventListener("act:logLine", function(e) { t._onLogLine(e); });
        // start tick
        this._tick();
    }

    remove()
    {
        super.remove();
        if (this.tickTimeout) {
            clearTimeout(this.tickTimeout);
        }
        this.currentZone = "";
    }
    
    showOptionHelp()
    {
        var helpText ="";
        helpText += "--- Spell Timer Widget ---\n";
        helpText += "Announces activation of skills and displays cooldown.";
        alert(helpText);
    }

    showOptionConfig()
    {
        var t = this;
        Modal.open();
        Modal.reset();
        Modal.addSection("Alerts");
        Modal.addText("Enable text-to-speech alerts on...");
        Modal.addCheckbox(
            "alert-activation",
            "Activation",
            this.userConfig["alertActivation"],
            function(name, checked) {
                t.userConfig["alertActivation"] = checked;
                t._saveUserConfig();
            }
        );
        Modal.addCheckbox(
            "alert-off-cooldown",
            "Off Cooldown",
            this.userConfig["alertOffCooldown"],
            function(name, checked) {
                t.userConfig["alertOffCooldown"] = checked;
                t._saveUserConfig();
            }
        );
        Modal.addSection("Skills");
        Modal.addText("Click on the skills you wish to be notified about.");
        for (var i in this.data) {
            var skillData = this.data[i];
            Modal.addCheckboxImage(
                "skill-" + skillData.id,
                skillData.icon,
                skillData.name,
                this.userConfig["skills"].indexOf(skillData.id) != -1,
                function(name, checked) {
                    var skillId = name.substring(6);
                    var index = t.userConfig["skills"].indexOf(skillId);
                    if (!checked && index != -1) {
                        t.userConfig["skills"].splice(index, 1);
                    } else if (checked && index == -1) {
                        t.userConfig["skills"].push(skillId);
                    }
                    t._saveUserConfig();
                    t._updateElements();
                }
            );
        }
    }

    /**
     * Generate elements 
     */
    _buildElements()
    {
        var skillContainerElement = this.getBodyElement().getElementsByClassName("skillTimerContainer")[0];
        for (var i in this.data) {
            this.data[i].activationTime = null;
            this.data[i].regex = new RegExp(this.data[i].regex);
            var skillData = this.data[i];
            var skillElement = document.createElement("div");
            skillElement.classList.add("skillTimerSkill", "skillTimerSkill-" + skillData.id);
            var skillIcon = document.createElement("img");
            skillIcon.src = skillData.icon;
            skillIcon.alt = skillData.name;
            skillIcon.title = skillData.name;
            skillElement.appendChild(skillIcon);
            skillContainerElement.appendChild(skillElement);
            var skillTimeElement = document.createElement("span");
            skillTimeElement.classList.add("skillTime");
            skillTimeElement.innerText = "";
            skillElement.appendChild(skillTimeElement);
        }
        this._updateElements();
    }

    /**
     * Update all skill timer elements.
     */
    _updateElements()
    {
        var hasActiveSkill = false;
        var skillContainerElement = this.getBodyElement().getElementsByClassName("skillTimerContainer")[0];
        for (var i in this.data) {
            var skillData = this.data[i];
            var skillElement = skillContainerElement.getElementsByClassName("skillTimerSkill-" + skillData.id)[0];
            if (!skillElement) {
                continue;
            }
            // not enabled or not active
            if (
                this.userConfig["skills"].indexOf(skillData.id) == -1 ||
                !skillData.activationTime
            ) {
                skillElement.classList.add("hide");
                continue;
            }
            hasActiveSkill = true;
            skillElement.classList.remove("hide");
            // determine status
            var duration = Date.now() - skillData.activationTime;
            var timerDisplay = "";
            // is active
            if (duration < skillData.duration * 1000) {
                skillElement.classList.remove("cooldown");
                timerDisplay = parseInt(skillData.duration - (duration / 1000));
                if (timerDisplay < 10) {
                    timerDisplay = "0" + timerDisplay;
                }
            // on cooldown
            } else if (duration < skillData.recast * 1000) {
                skillElement.classList.add("cooldown");
                timerDisplay = parseInt(skillData.recast - (duration / 1000));
                if (timerDisplay < 10) {
                    timerDisplay = "0" + timerDisplay;
                }
            // off cooldown
            } else {
                this.data[i].activationTime = null;
                if (this.userConfig["alertOffCooldown"] && skillData.recast > 0) {
                    this._speak(
                        skillData.tts + " ready"
                    );
                }
            }
            // update timer text
            skillElement.getElementsByClassName("skillTime")[0].innerText = timerDisplay;
        }
        // show/hide "no active skills" element
        var noActiveSkillsElement = skillContainerElement.getElementsByClassName("noActiveSkills")[0];
        noActiveSkillsElement.classList.remove("hide");
        if (hasActiveSkill) {
            noActiveSkillsElement.classList.add("hide");
        }
    }

    /**
     * Process a log line event.
     * @param {Event} event 
     */
    _onLogLine(event)
    {
        for (var i in this.data) {
            var skillData = this.data[i];
            // not enabled
            if (this.userConfig["skills"].indexOf(skillData.id) == -1) {
                continue;
            }
            // already activated
            if (skillData.activationTime) {
                continue;
            }
            // check if matches log line
            var matches = event.detail.LogLine.match(skillData.regex);
            if (matches) {
                console.log(">> Skilltimer, skill " + skillData.name + " was activated.", skillData);
                // get duration from trigger
                if (isNaN(this.data[i].duration)) {
                    for (var key in matches) {
                        this.data[i].duration = this.data[i].duration.replace("{{M" + key + "}}", matches[key]);
                    }
                    this.data[i].duration = parseInt(this.data[i].duration);
                }
                if (!this.data[i].duration) {
                    continue;
                }
                // set activation time to now
                this.data[i].activationTime = Date.now();

                // alert
                if (this.userConfig["alertActivation"]) {
                    this._speak(skillData.tts);
                }

            }
        }
    }

    /**
     * Process a encounter event.
     * @param {Event} event 
     */
    _onEncounter(event)
    {
        if (this.encounterId != event.detail.ID) {
            this.encounterId = event.detail.ID;
            for (var i in this.data) {
                this.data[i].activationTime = null;
            }
            this._updateElements();
        }
    }

    /**
     * Retrieve skill timer data.
     */
    _fetchData()
    {
        if (this.data) {
            return;
        }
        var request = new XMLHttpRequest();
        request.open("GET", "/static/data/skilltimer.json", true);
        request.send();
        var t = this;
        request.addEventListener("load", function(e) {
            console.log(">> Skilltimer, fetched data.");
            t.data = JSON.parse(request.response);
            t._buildElements();
        });
        request.addEventListener("error", function(e) {
            throw e;
        });
        request.addEventListener("abort", function(e) {
            throw e;
        });
    }

    /**
     * Update timers.
     */
    _tick()
    {
        if (this.tickTimeout) {
            clearTimeout(this.tickTimeout);
        }
        this._updateElements();
        this.tickTimeout = setTimeout(
            function(t) {
                t._tick();
            },
            1000,
            this
        );
    }

    /**
     * Say text with TTS.
     * @param {string} text 
     */
    _speak(text)
    {
        var u = new SpeechSynthesisUtterance(text);
        speechSynthesis.speak(u);
    }

}