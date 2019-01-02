# FFLiveParse - Server

FFLiveParse is a tool for sharing your Final Fantasy XIV log and parse data from Advanced Combat Tracker (ACT) on the web in real time.

This is the main server component, it listens for log data from the ACT plugin and relays it to users via web sockets.


## Web Site How To

When you generate a key for yourself you are given a personal parse page. This page takes data from your ACT and displays the parses and action timelines with it. You are free to share this page with others.


## Viewing Past Encounters

Eventually you'll be able to view data on past encounters. While encounter data is currently being collected a way to view past data has not yet been implemented.


## Custom Plugins

Eventually you'll be able to add custom third party plugins that can extends FFLiveParse's functionality and provide additional data and triggers.

Some custom plugin ideas...

- UWU Jail Plugin that works for PS4 users
- Text-to-speech triggers to help line up raid buffs


## Todos

- Modal popup for all actions on timeline.
- Display more information about actions on timeline...damage done, how much HP target had, etc
- More information and nicer layout for deaths in the timeline.
- Past encounter list. (Be able to review all your past encounters.)
- Ability to have user provided custom widgets/plugins.
- Restore functionality from v0.XX
    - Custom triggers
    - Cactbot triggers