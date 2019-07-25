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

class ViewLogs extends ViewBase
{

    getName()
    {
        return "logs";
    }

    getTitle()
    {
        return "Log Viewer";
    }

    init()
    {
        super.init();
        this.buildBaseElements();
        this.reset();
    }

    buildBaseElements()
    {
        var element = this.getElement();
        this.logContainerElement = document.createElement("div");
        this.logContainerElement.classList.add("log-container");
        element.appendChild(this.logContainerElement);
    }

    reset()
    {
        this.encounter = null;
        this.logQueue = [];
        this.logContainerElement.innerHTML = "";
    }

    /**
     * Create element for combatant.
     * @param {Combatant} combatant
     * @param {string} altName
     * @param {Action} action
     * @return {Element}
     */
    createCombatantElement(combatant, altName, action)
    {

        // create main element
        var combatantElement = document.createElement("div");
        combatantElement.classList.add("action-combatant");
        // get job icon
        var jobIconSrc = "/static/img/enemy.png";
        if (action && action.sourceIsPet()) {
            jobIconSrc = "/static/img/job/pet.png";
        }
        if (combatant && combatant.getLastSnapshot().Job != "enemy") {
            jobIconSrc = "/static/img/job/" + combatant.getLastSnapshot().Job.toLowerCase() + ".png";
        }
        // create job icon element
        var combatantImgElement = document.createElement("img");
        combatantImgElement.src = jobIconSrc;
        combatantImgElement.alt = combatant ? combatant.getDisplayName() : altName;
        combatantImgElement.title = combatantImgElement.alt;
        combatantElement.appendChild(combatantImgElement);
        // create damage element
        if (
            action != null &&
            (
                action.data.flags.indexOf(LOG_LINE_FLAG_DAMAGE) != -1 ||
                action.data.flags.indexOf(LOG_LINE_FLAG_HEAL) != -1
            )
        ) {
            var combatantDamageElement = document.createElement("div");
            combatantDamageElement.classList.add("action-damage");
            if (action.data.flags.indexOf(LOG_LINE_FLAG_HEAL) != -1) {
                combatantDamageElement.classList.add("action-damage-heal");
            }
            combatantDamageElement.innerText = action.data.damage;
            combatantElement.appendChild(combatantDamageElement);
        }
        return combatantElement;
    }

    /**
     * Create log element for given log line.
     * @param {Action} action
     */
    addLogLineElement(action)
    {      
        if (!action.displayAction || !action.type || !this.actionData) {
            return;
        }
        if (
            this.lastAddedAction && 
            action.type == this.lastAddedAction.type &&
            action.data.actionName == this.lastAddedAction.data.actionName &&
            action.time.getTime() == this.lastAddedAction.time.getTime()
        ) {
            return;
        }

        var logElement = document.createElement("div");
        logElement.classList.add("action", "action-" + action.type)
        
        // create time element
        var timeElement = document.createElement("div");
        timeElement.classList.add("action-time")
        var timeElasped = new Date(action.time - this.encounter.data.StartTime);
        timeElement.innerText = (timeElasped.getMinutes() < 0 ? "0" : "") + 
        timeElasped.getMinutes() + ":" + 
            (timeElasped.getSeconds() < 10 ? "0" : "") + 
            timeElasped.getSeconds() + "." +
            (timeElasped.getMilliseconds() < 10 ? "0" : "") +
            (timeElasped.getMilliseconds() < 100 ? "0" : "") +
            timeElasped.getMilliseconds()
        ;
        logElement.appendChild(timeElement);

        // create source element
        var sourceCombatantElement = this.createCombatantElement(
            action.sourceCombatant,
            action.data.sourceName
        );
        sourceCombatantElement.classList.add("action-source");
        logElement.appendChild(sourceCombatantElement);

        // create action element
        var actionIcon = this.getActionIcon(action);
        var actionIconElement = document.createElement("div");
        actionIconElement.classList.add("action-icon");
        var actionIconInnerElement = document.createElement("div");
        actionIconInnerElement.classList.add("action-icon-inner");
        actionIconElement.appendChild(actionIconInnerElement);
        var actionIconImgElement = document.createElement("img");
        actionIconImgElement.src = actionIcon;
        actionIconImgElement.alt = action.data.actionName;
        actionIconImgElement.title = actionIconImgElement.alt;
        actionIconInnerElement.appendChild(actionIconImgElement);

        logElement.appendChild(actionIconElement);

        // create target elements
        var targetCombatantContainerElement = document.createElement("div");
        targetCombatantContainerElement.classList.add("action-targets");
        targetCombatantContainerElement.appendChild(
            this.createCombatantElement(
                action.targetCombatant,
                action.data.targetName,
                action
            )
        );
        for (var i in action.relatedActions) {
            targetCombatantContainerElement.appendChild(
                this.createCombatantElement(
                    action.relatedActions[i].targetCombatant,
                    action.relatedActions[i].data.targetName,
                    action.relatedActions[i]
                )
            );
        }
        logElement.appendChild(targetCombatantContainerElement);

        this.logContainerElement.appendChild(logElement);
        this.lastAddedAction = action;
    }

    processLogQueue()
    {
        if (!this.actionData || !this.statusData || !this.encounter) {
            return;
        }
        var logLine = null;
        while (logLine = this.logQueue.shift()) {

            // parse log line
            var logData = parseLogLine(logLine.LogLine);
            // ensure we want to display log for this line
            if ([MESSAGE_TYPE_GAME_LOG].indexOf(logData.type) == -1) {
                continue;
            }

            // create log element
            var logElement = document.createElement("div");
            logElement.classList.add("log-line", "log-line-" + logData.type);

            // create time element
            var timeElement = document.createElement("div");
            timeElement.innerText = "";
            timeElement.classList.add("log-line-time")
            var timeElasped = new Date(logLine.Time - this.encounter.data.StartTime);
            if (logLine.Time < this.encounter.data.StartTime) {
                timeElasped = new Date(this.encounter.data.StartTime - logLine.Time);
                timeElement.innerText = "-";
            }

            timeElement.innerText += (timeElasped.getMinutes() < 0 ? "0" : "") + 
            timeElasped.getMinutes() + ":" + 
                (timeElasped.getSeconds() < 10 ? "0" : "") + 
                timeElasped.getSeconds() + "." +
                (timeElasped.getMilliseconds() < 10 ? "0" : "") +
                (timeElasped.getMilliseconds() < 100 ? "0" : "") +
                timeElasped.getMilliseconds()
            ;
            logElement.appendChild(timeElement);
            // handle specific log line
            switch (logData.type) {
                case MESSAGE_TYPE_GAME_LOG:
                {
                    var logMessageElement = document.createElement("div");
                    logMessageElement.classList.add("log-line-data");

                    for (var i in this.combatantCollector.combatants) {
                        var combatant = this.combatantCollector.combatants[i];
                        /*var combatantName = combatant.getDisplayName();
                        var jobIconSrc = "/static/img/job/" + combatant.getLastSnapshot().Job.toLowerCase() + ".png";
                        logData.message = logData.message.replace(
                            combatantName,
                            '<img src="' + jobIconSrc + '" alt="' + combatantName + '" title=" '+ combatantName + '"> ' + combatantName
                        );*/
                        if (combatant.data.World) {
                            logData.message = logData.message.replace(
                                combatant.data.World,
                                ""
                            );
                        }
                    }

                    logMessageElement.innerHTML = logData.message;
                    logMessageElement.style.color = "rgb(" + logData.color.join(",") + ")";
                    logElement.appendChild(logMessageElement);
                    break;
                }
            }
            this.logContainerElement.insertBefore(
                logElement,
                this.logContainerElement.firstChild
            );            
        }
    }

    onEncounter(encounter)
    {
        this.reset();
        this.encounter = encounter;
    }

    onLogLine(logLineData)
    {
        this.logQueue.push(logLineData);
        this.processLogQueue();
    }

    onResize()
    {
        var element = this.getElement();
        element.style.height = this.getViewHeight() + "px";
    }

}
