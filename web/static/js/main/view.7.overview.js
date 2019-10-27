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

/** Downtime offsets for specific fights. */
var TTC_DOWNTIME_OFFSETS = {
};

class ViewOverview extends ViewBase
{

    getName()
    {
        return "overview";
    }

    getTitle()
    {
        return "Overview";
    }

    init()
    {
        super.init();
        this.buildBaseElements();
        this.reset();
        this.tickTimeout = null;
        this.tick();
    }

    reset()
    {
        this.encounter = null;
        this.endWait = false;
        this.playerElements = {};
        this.cooldownQueue = [];
        this.bossTracker = [];
        this.playerListElement.innerHTML = "";
        this.lastLogUpdate = null;
        this.totalDeaths = 0;
        this.onResize();
    }

    buildBaseElements()
    {
        var element = this.getElement();

        // active view
        this.activeElement = document.createElement("div");
        this.activeElement.classList.add("active");
        // cards
        this.rdspElement = this._addCardElement(
            "rdps",
            "Raid DPS"
        );
        this.ttcElement = this._addCardElement(
            "time-to-clear",
            "Est. Clear Time"
        );
        this.bossHpElement = this._addCardElement(
            "boss-hp",
            "Boss HP (%)"
        );
        this.deathsElement = this._addCardElement(
            "deaths",
            "Death(s)"
        );
        // player element
        this.playerListElement = document.createElement("div");
        this.playerListElement.classList.add("players");
        this.activeElement.append(this.playerListElement);
        element.appendChild(this.activeElement);

        // encounter summary
        //this.summaryElement = document.createElement("div");
        //this.summaryElement.classList.add("summary", "hide");
        //element.appendChild(this.summaryElement);
    }

    /**
     * Add a card to display an "at a glance" combat value.
     * @param {string} name 
     * @param {string} desc 
     */
    _addCardElement(name, desc)
    {
        // container
        var containerElement = document.createElement("div");
        containerElement.classList.add("card-container", "card-" + name);
        // value
        var valueElement = document.createElement("div");
        valueElement.classList.add("card-value");
        valueElement.innerText = "-";
        containerElement.appendChild(valueElement);
        // desc
        var descElement = document.createElement("div");
        descElement.classList.add("card-desc");
        descElement.innerText = desc;
        containerElement.appendChild(descElement);
        // add
        this.activeElement.appendChild(containerElement);
        return valueElement;
    }

    /**
     * Add player element.
     * @param Combatant combatant 
     */
    _addPlayerElement(combatant)
    {
        // container
        var playerElement = document.createElement("div");
        playerElement.classList.add("player", combatant.getRole());

        // job icon
        var jobVal = combatant.data.Job.toLowerCase();
        var jobElement = document.createElement("img");
        jobElement.classList.add("job");
        jobElement.src = "/static/img/job/" + jobVal + ".png";
        jobElement.alt = "Job '" + jobVal.toUpperCase() + "'";
        jobElement.title = jobVal.toUpperCase() + " - " + combatant.getDisplayName();
        playerElement.appendChild(jobElement);

        // dps
        var dpsElement = document.createElement("div");
        dpsElement.classList.add("dps");
        dpsElement.innerText = "-";
        playerElement.appendChild(dpsElement);

        // hps
        var hpsElement = document.createElement("div");
        hpsElement.classList.add("hps");
        hpsElement.classList.add("extras");
        hpsElement.innerText = "-";
        playerElement.appendChild(hpsElement);

        // damage taken
        var dTakenElement = document.createElement("div");
        dTakenElement.classList.add("damage-taken");
        dTakenElement.classList.add("extras");
        dTakenElement.innerText = "-";
        playerElement.appendChild(dTakenElement);

        // deaths
        var deathsElement = document.createElement("div");
        deathsElement.classList.add("deaths");
        deathsElement.classList.add("extras");
        deathsElement.innerText = "0";
        playerElement.appendChild(deathsElement);

        // cooldowns
        var cooldownElement = document.createElement("div");
        cooldownElement.classList.add("cooldowns");
        playerElement.appendChild(cooldownElement);

        // actions
        var actionElement = document.createElement("div");
        actionElement.classList.add("actions");
        playerElement.appendChild(actionElement);

        // add
        this.playerListElement.appendChild(playerElement);
        return playerElement;
    }

    /**
     * Add a cooldown to be displayed.
     * @param Combatant combatant 
     * @param Action action 
     */
    _addCooldown(combatant, action)
    {
        // ensure player/combatant has element
        if (typeof(this.playerElements[combatant.data.ID]) == "undefined") {
            return;
        }
        var playerElement = this.playerElements[combatant.data.ID];
        // delete existing
        var existingElements = playerElement.getElementsByClassName("cooldown-action-" + action.data.actionId);
        for (var i = 0; i < existingElements.length; i++) {
            existingElements[i].remove();
        }
        // get action data
        var actionData = this.actionData.getActionById(action.data.actionId);
        if (!actionData) {
            return;
        }
        // create element
        var cooldownElement = document.createElement("div");
        cooldownElement.classList.add("cooldown", "cooldown-action-" + action.data.actionId);
        // set end time
        var endTime = action.time.getTime() + (actionData.cooldown * 1000);
        cooldownElement.setAttribute("data-end-time", endTime);
        // add action icon
        var actionIconElement = document.createElement("img");
        actionIconElement.classList.add("action-icon");
        actionIconElement.src = this.getActionIcon(action);
        actionIconElement.alt = action.data.actionName;
        actionIconElement.title = action.data.actionName;
        cooldownElement.appendChild(actionIconElement);
        // add time
        var cooldownTimeElement = document.createElement("div");
        cooldownTimeElement.classList.add("time");
        cooldownTimeElement.innerText = "-";
        cooldownElement.appendChild(cooldownTimeElement);
        // add
        playerElement.getElementsByClassName("cooldowns")[0].appendChild(cooldownElement);
    }

    /**
     * Add an action to be displayed.
     * @param Combatant combatant 
     */
    _addAction(action)
    {
        if (!this.actionData || !this.encounter || !this.encounter.data.Active) {
            return;
        }
        var combatant = action.sourceCombatant;
        if (!combatant) {
            return;
        }
        // ensure player/combatant has element
        if (typeof(this.playerElements[combatant.data.ID]) == "undefined") {
            return;
        }
        var playerElement = this.playerElements[combatant.data.ID];
        // get action data
        var actionData = this.actionData.getActionById(action.data.actionId);
        if (!actionData) {
            return;
        }
        // create element
        var actionElement = document.createElement("img");
        actionElement.classList.add("action");
        actionElement.alt = action.data.actionName;
        actionElement.title = action.data.actionName;
        actionElement.src = this.getActionIcon(action);
        // add
        playerElement.getElementsByClassName("actions")[0].appendChild(actionElement);
        setTimeout(
            function(ele) {
                ele.style.left = "9999px";
            },
            250,
            actionElement
        );
        setTimeout(
            function(ele) {
                ele.remove();
            },
            5000,
            actionElement
        );
    }

    tick()
    {
        if (this.tickTimeout) {
            clearTimeout(this.tickTimeout);
        }
        this._processCooldownQueue();
        this._updateElements();
        this._updateCooldowns();
        this.onResize();
        var t = this;
        this.tickTimeout = setTimeout(
            function() { t.tick(); },
            1000
        );
    }

    _updateElements()
    {
        if (!this.encounter) {
            return;
        }
        // update players
        var raidDps = 0;
        var combatants = this.combatantCollector.getSortedCombatants("damage");
        var offsetPos = 0;
        for (var i in combatants) {
            var combatant = combatants[i];
            var snapshot = combatant.getLastSnapshot();
            // get damage / dps
            var damage = this.combatantCollector.getCombatantTotalDamage(combatant);
            var dps = damage / (this.encounter.getLength() / 1000);
            raidDps += dps;
            if (snapshot.ID in this.playerElements) {
                // get healing / hps
                var healing = this.combatantCollector.getCombatantTotalHealing(combatant);
                var hps = healing / (this.encounter.getLength() / 1000);
                var hpsK = hps / 1000;
                // get damage taken
                var damageTaken = combatant.data.DamageTaken;
                var damageTakenK = damageTaken / 1000;
                var playerElement = this.playerElements[snapshot.ID];
                playerElement.style.top = (offsetPos) + "px";
                offsetPos += playerElement.offsetHeight
                // set dps
                var dpsElement = playerElement.getElementsByClassName("dps")[0];
                //dpsElement.setAttribute("data-damage", damage);
                if (dpsElement.innerText != dps.toFixed(2)) {
                    dpsElement.innerText = dps.toFixed(2);
                    dpsElement.title = dps.toFixed(2) + " damage per second (" + damage + " total damage)";
                }
                // set hps
                var hpsElement = playerElement.getElementsByClassName("hps")[0];
                //dpsElement.setAttribute("data-healing", healing);
                if (hpsElement.innerText != hpsK.toFixed(1) + "K") {
                    hpsElement.innerText = hpsK.toFixed(1) + "K";
                    hpsElement.title = hps.toFixed(2) + " healing per second (" + healing + " total healing)";
                }
                // set damage taken
                var damageTakenElement = playerElement.getElementsByClassName("damage-taken")[0];
                if (damageTakenElement.innerText != damageTakenK.toFixed(1) + "K") {
                    damageTakenElement.innerText = damageTakenK.toFixed(1) + "K";
                    damageTakenElement.title = damageTaken + " damage taken.";
                }           
            }
        }
        // update raid dps
        raidDps = raidDps.toFixed(2)
        if (this.rdspElement.innerText != raidDps) {
            this.rdspElement.innerText = raidDps;
        }
        // update time to clear
        if (this.bossTracker && this.encounter) {
            var bossMaxHp = this.bossTracker[1];
            var seconds = parseInt(bossMaxHp / raidDps);
            if (isNaN(seconds)) {
                seconds = 0;
            }
            // offset
            if (this.encounter.data.Zone in TTC_DOWNTIME_OFFSETS) {
                seconds += TTC_DOWNTIME_OFFSETS[this.encounter.data.Zone];
            }
            var mins = parseInt(Math.floor(seconds / 60));
            if (mins < 10) {
                mins = "0" + mins;
            }
            var seconds = seconds % 60;
            if (seconds < 10) {
                seconds = "0" + seconds;
            }
            var timeStr = mins + ":" + seconds;
            if (this.ttcElement.innerText != timeStr) {
                this.ttcElement.innerText = timeStr;
            }
        }        
        // set player list height
        if (this.playerListElement.children.length > 0) {
            this.playerListElement.style.height = (combatants.length * this.playerListElement.children[0].offsetHeight) + "px";
        }

    }

    _processCooldownQueue()
    {
        if (!this.actionData) {
            return;
        }
        // itterate actions in queue
        var action = null;
        while (action = this.cooldownQueue.shift()) {
            // must have action id and source combatant
            if (action.data.actionId == 0 || !action.sourceCombatant) {
                continue;
            }
            // fetch action data
            var actionData = this.actionData.getActionById(action.data.actionId);
            if (!actionData || actionData.cooldown < 10) {
                continue;
            }
            this._addCooldown(
                action.sourceCombatant,
                action
            );
        }
    }

    _updateCooldowns()
    {
        if (!this.encounter) {
            return;
        }
        var currentTime = new Date().getTime();
        for (var i in this.playerElements) {
            var elementsGet = this.playerElements[i].getElementsByClassName("cooldown");
            var cooldownElements = [];
            for (var j = 0; j < elementsGet.length; j++) {
                cooldownElements.push(elementsGet[j]);
            }
            cooldownElements.sort(function(a, b) {
                return parseInt(a.getAttribute("data-end-time")) > parseInt(b.getAttribute("data-end-time"));
            });
            for (var j = 0; j < cooldownElements.length; j++) {
                var endTime = cooldownElements[j].getAttribute("data-end-time");
                var seconds = ((parseInt(endTime) - currentTime) / 1000).toFixed(0);
                if (seconds <= 0) {
                    cooldownElements[j].remove();
                    continue;
                }
                cooldownElements[j].parentNode.appendChild(cooldownElements[j]);
                if (seconds < 10) {
                    cooldownElements[j].classList.add("blink");
                    seconds = "00" + seconds
                } else if (seconds < 100) {
                    seconds = "0" + seconds;
                }
                cooldownElements[j].getElementsByClassName("time")[0].innerText = seconds;
            }
        }
    }

    onEncounterActive(encounter)
    {
        this.reset();
        this.deathsElement.innerText = "0";
    }

    onEncounter(encounter)
    {
        this.endWait = encounter.data.EndWait;
        this.encounter = encounter;
    }

    onCombatant(combatant)
    {
        if (typeof(this.playerElements[combatant.data.ID]) == "undefined") {
            this.playerElements[combatant.data.ID] = this._addPlayerElement(combatant);
        }
    }

    onAction(action)
    {
        this.cooldownQueue.push(action);
        this._addAction(action);
    }

    onActive()
    {
        super.onActive();
    }

    onLogLine(logLineData)
    {
        if (logLineData.Time < this.lastLogUpdate) {
            return;
        }
        this.lastLogUpdate = logLineData.Time;
        // parse log line
        var pLogLine = parseLogLine(logLineData.LogLine);  
        switch (pLogLine.type) {
            case MESSAGE_TYPE_SINGLE_TARGET: {
                // track boss hp
                var tMaxHp = parseInt(pLogLine.targetMaxHp);
                var tCurHp = parseInt(pLogLine.targetCurrentHp - pLogLine.damage);
                if (tMaxHp > 0) {
                    if (this.bossTracker.length == 0 || this.bossTracker[1] <= tMaxHp || this.bossTracker[2] <= 0) {
                        this.bossTracker = [
                            pLogLine.targetName,
                            tMaxHp,
                            tCurHp
                        ];
                        var percent = (tCurHp / tMaxHp) * 100;
                        if (percent < 0) {
                            percent = 0;
                        }
                        if (isNaN(percent)) {
                            percent = 0
                        }
                        this.bossHpElement.innerText = percent.toFixed(2) + "%";
                    }
                }
                // flag player alive
                if (pLogLine.flags.indexOf(LOG_LINE_FLAG_DAMAGE) != -1) {
                    var combatant = this.combatantCollector.find(pLogLine.sourceName);
                    if (combatant && combatant.data.ID in this.playerElements) {
                        if (this.playerElements[combatant.data.ID].classList.contains("dead")) {
                            this.playerElements[combatant.data.ID].classList.remove("dead");
                        }
                    }
                }
                break;
            }
            case MESSAGE_TYPE_DEATH: {
                // track deaths
                var combatant = this.combatantCollector.find(pLogLine.sourceName);
                if (!combatant) {
                    break;
                }
                if (!(combatant.data.ID in this.playerElements)) {
                    break;
                }
                this.playerElements[combatant.data.ID].classList.add("dead");
                this.totalDeaths++;
                this.deathsElement.innerText = this.totalDeaths;
                var playerDeathsElement = this.playerElements[combatant.data.ID].getElementsByClassName("deaths")[0];
                var playerDeaths = parseInt(playerDeathsElement.innerText);
                if (!playerDeaths) {
                    playerDeaths = 0;
                }
                playerDeathsElement.innerText = playerDeaths + 1;
                break;
            }

        }
    }

    onResize()
    {
        super.onResize();
        // adjust card widths
        var cardWidth = Math.floor(this.getViewWidth() / 2) - 2;
        var cards = this.getElement().getElementsByClassName("card-container");
        for (var i = 0; i < cards.length; i++) {
            cards[i].style.width = cardWidth + "px";
        }
    }

}