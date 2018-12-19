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

var USER_CONFIG_LOCAL_STORAGE_KEY = "chompy_ffxiv_user_config";

/**
 * Widget base class.
 */
class WidgetBase
{

    /**
     * Widget constructor.
     */
    constructor()
    {
        this.element = null;
        this.eventListenerCallbacks = {};
        this.userConfig = {};
        this._loadUserConfig();
    }

    /**
     * Get name of this widget.
     */
    getName()
    {
        return "base";
    }

    /**
     * Get user friendly title for this widget.
     */
    getTitle()
    {
        return "Base";
    }

    /**
     * Initialize widget.
     */
    init()
    {
        return;
    }

    /**
     * Add an event listener, store callback so that
     * it can be removed later.
     * @param {string} event 
     * @param {function} callback 
     */
    addEventListener(event, callback)
    {
        if (!(event in this.eventListenerCallbacks)) {
            this.eventListenerCallbacks[event] = [];
        }
        this.eventListenerCallbacks[event].push(callback);
        window.addEventListener(
            event,
            callback
        );
    }

    /**
     * Remove all event listeners added with 'addEventListener.'
     */
    removeAllEventListeners()
    {
        for (var event in this.eventListenerCallbacks) {
            for (var i in this.eventListenerCallbacks[event]) {
                window.removeEventListener(
                    event,
                    this.eventListenerCallbacks[event][i]
                );
            }
        }
        this.eventListenerCallbacks = {};
    }

    /**
     * Load user config from local storage and
     * set userConfig var.
     */
    _loadUserConfig()
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
    _saveUserConfig()
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
     * Check that number is valid number for parsing.
     * I.e. a real number that is a non negative
     * @param {numeric} value 
     */
    _isValidParseNumber(value)
    {
        return (
            !isNaN(value) &&
            isFinite(value) &&
            value >= 0
        );
    }

}