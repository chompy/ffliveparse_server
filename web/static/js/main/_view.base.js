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

var VIEW_CONTAINER_ELEMENT_ID = "views";
var USER_CONFIG_LOCAL_STORAGE_KEY = "chompy_ffxiv_user_config";

/**
 * View base class.
 */
class ViewBase
{

    /**
     * @param {CombatantCollector} combatantCollector 
     * @param {ActionCollector} actionCollector 
     */
    constructor(combatantCollector, actionCollector)
    {
        this.combatantCollector = combatantCollector;
        this.actionCollector = actionCollector;
        this.actionData = null;
        this.statusData = null;
        this.element = null;
        this.active = false;
        this.eventListenerCallbacks = {};
        this.userConfig = {};
        this.ready = false;
        this.loadUserConfig();
    }

    /**
     * Get view name.
     * @return {string}
     */
    getName()
    {
        return "base";
    }

    /**
     * Get view title.
     * @return {string}
     */
    getTitle()
    {
        return "Default";
    }

    /**
     * Initlize the view.
     */
    init()
    {
        return;
    }

    /**
     * Get this view's element.
     * @return {object}
     */
    getElement()
    {
        if (this.element) {
            return this.element;
        }
        var elementId = "view-" + this.getName();
        this.element = document.getElementById(elementId);
        if (!this.element) {
            var viewContainerElement = document.getElementById(VIEW_CONTAINER_ELEMENT_ID);
            this.element = document.createElement("div");
            this.element.setAttribute("id", elementId);
            this.element.classList.add("hide");
            viewContainerElement.appendChild(this.element);
        }
        return this.element;
    }

    /**
     * Called when the application is loaded and ready,
     * this occurs after all previous log lines have been processed.
     */
    onReady()
    {
        this.ready = true;
        return;
    }

    /**
     * Called when this view becomes the active view.
     */
    onActive()
    {
        this.active = true;
        this.getElement().classList.remove("hide");
        setTimeout(function(){ fflpFixFooter(); }, 500);
    }

    /**
     * Called when this view is no longer the active view.
     */
    onInactive()
    {
        this.active = false;
        this.getElement().classList.add("hide");
    }

    /**
     * Called when a new encounter is started.
     * @param {object} encounter 
     */
    onEncounter(encounter)
    {
        return;
    }

    /**
     * Called when an encounter becomes inactive.
     * @param {object} encounter 
     */
    onEncounterInactive(encounter)
    {
        return;
    }

    /**
     * Called when a combatant is added/updated.
     * @param {Combatant} combatant 
     */
    onCombatant(combatant)
    {
        return;
    }

    /**
     * Called when a new action is added.
     * @param {Action} action 
     */
    onAction(action)
    {
        return;
    }

    /**
     * Called when a new log line is parsed.
     * @param {object} logLineData 
     */
    onLogLine(logLineData)
    {
        return;
    }

    /**
     * Called when browser window is resized.
     */
    onResize()
    {
        return;
    }

    /**
     * Load user config from local storage and
     * set userConfig var.
     */
    loadUserConfig()
    {
        this.userConfig = {};
        var userConfig = JSON.parse(window.localStorage.getItem(USER_CONFIG_LOCAL_STORAGE_KEY));
        if (!userConfig) {
            return;
        }
        if (this.getName() in userConfig) {
            this.userConfig = userConfig[this.getName()];
        }
    }

    /**
     * Save userConfig var to local storage.
     */
    saveUserConfig()
    {
        var userConfig = JSON.parse(window.localStorage.getItem(USER_CONFIG_LOCAL_STORAGE_KEY));
        if (!userConfig) {
            userConfig = {};
        }
        userConfig[this.getName()] = this.userConfig;
        window.localStorage.setItem(
            USER_CONFIG_LOCAL_STORAGE_KEY,
            JSON.stringify(userConfig)
        );
    }

    /**
     * Get width available to view.
     * @return {int}
     */
    getViewWidth()
    {
        return window.innerWidth;
    }

    /**
     * Get height available to view.
     * @return {int}
     */
    getViewHeight()
    {
        return window.innerHeight - 
            (
                document.getElementById("head").offsetHeight +
                document.getElementById("footer").offsetHeight +
                document.getElementById("encounter").offsetHeight
            )
        ;            
    }

}