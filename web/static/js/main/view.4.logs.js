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
        this.encounter = null;
        var t = this;
        setTimeout(function() {
            t.onResize();
        }, 100);
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
        this.offset = 0;
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
        if (combatant && combatant.data.Job != "enemy") {
            jobIconSrc = "/static/img/job/" + combatant.data.Job.toLowerCase() + ".png";
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
        if (!action.displayAction || !action.type) {
            return;
        }
        var logElement = document.createElement("div");
        logElement.classList.add("action", "action-" + action.type)
        
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

        switch (action.type)
        {
            case ACTION_TYPE_NORMAL:
            {

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
                actionIconElement.classList.add("action-icon")
                var actionIconImgElement = document.createElement("img");
                actionIconImgElement.src = actionIcon;
                actionIconImgElement.alt = action.data.actionName;
                actionIconImgElement.title = actionIconImgElement.alt;
                actionIconElement.appendChild(actionIconImgElement);
                logElement.appendChild(actionIconElement);


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

                break;
            }
        }



        this.logContainerElement.appendChild(logElement);

    }

    onReady()
    {
        this.reset();
        var actions = this.actionCollector.findByOffset(
            this.offset,
            -1
        );
        this.offset += actions.length;
        for (var i in actions) {
            this.addLogLineElement(actions[i]);
        }
    }

    onEncounter(encounter)
    {
        this.encounter = encounter;
        this.reset();
    }

    onResize()
    {
        var element = this.getElement();
        element.style.height = this.getViewHeight() + "px";
    }

}
