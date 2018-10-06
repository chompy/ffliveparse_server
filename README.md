# FFLiveParse - Server

FFLiveParse is a tool for sharing your Final Fantasy XIV log and parse data from Advanced Combat Tracker (ACT) on the web in real time.

This is the main server component, it listens for log data from the ACT plugin and relays it to users via web sockets.


## Web Site How To

When you generate a key for yourself you are given a personal parse page. This page will displays the data from your ACT. The default view displays information about the current encounter and the parses for all combatants.

You can add additional widgets by clicking the white cog wheel in the top right corner of the page.


### Widgets

**Encounter**

The encounter widget will either display the current time in an active encounter or display the total time for the last active encounter. It also shows the zone name and total raid DPS.

**Parse**

Displays all allied combatants and their damage per second, healing per second, and deaths in the encounter. You can click the black cog wheel to add or remove columns as well as sorting options.


**Custom Triggers**

Allows the import of custom ACT triggers that use text-to-speech. Click the black cog wheel to import or remove triggers.

**Cactbot Triggers**

Provides audible alerts for mechanics in many of the games raid fights. These are the same triggers that are part of the cactbot raidboss ACT overlay. See... [https://github.com/quisquous/cactbot](https://github.com/quisquous/cactbot). Click the black cog wheel to configure what types of audio alerts you recieve and add your character name to recieve custom callouts (i.e. boss is targeting YOU).

**Skill Timer**

Provides text-to-speech alerts when skills are used. This is meant to be used to track when allies are using their raid buffs. Click the black cog wheel to choose if you want callouts for skill activation and skill off cooldown. You can also pick which skills get called out.Not every skill has been implemented yet...


## Todos

- Past encounter list. (Be able to review all your past encounters.)
- Skill timer widget, more skills, more options.
- Encounter log widget, list details about the encounter (attacks, deaths, etc)
- Ranking system, maybe?