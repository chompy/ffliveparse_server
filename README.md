# FFLiveParse - Server

FFLiveParse is a tool for sharing your Final Fantasy XIV log and parse data from Advanced Combat Tracker (ACT) on the web in real time.

This is the main server component, it listens for log data from the ACT plugin and relays it to users via web sockets.


## Web Site How To

When you generate a key for yourself you are given a personal parse page. This page takes data from your ACT and displays the parses and action timelines with it. You are free to share this page with others.


## Stream Mode

You can access a more streaming friendly layout of the parses by appending #stream to the end of your parse URL.

If your URL looks like this...

https://www.ffliveparse.com/abc123

...then...

https://www.ffliveparse.com/abc123#stream


## Viewing Past Encounters

Eventually you'll be able to view data on past encounters. While encounter data is currently being collected a way to view past data has not yet been implemented.


## Custom Plugins

Eventually you'll be able to add custom third party plugins that can extends FFLiveParse's functionality and provide additional data and triggers.

Some custom plugin ideas...

- UWU Jail Plugin that works for PS4 users
- Text-to-speech triggers to help line up raid buffs


## Running The Server On Your Own Machine

You can run the server on your own machine if you prefer. 

1. Download the appropiate binary for your OS here... https://github.com/chompy/ffliveparse_server/releases
2. Launch the server executable, on Windows it's ffliveparse_server.exe.
3. Perform the steps needed to get the [ACT plugin](https://github.com/chompy/ffliveparse_act_plugin#getting-started) installed except instead of visting ffliveparse.com go to http://127.0.0.1:8081 instead. ACT plugin instructions... https://github.com/chompy/ffliveparse_act_plugin#getting-started
4. Under the 'Upload Server Address' in ACT change it from 'ffliveparse.com:31593' to '127.0.0.1:31593.' Click 'Save / Connect.'


## Todos

- Ability to have user provided custom widgets/plugins.
- Restore functionality from v0.XX
    - Custom triggers
    - Cactbot triggers
- Restore functionality from v1.16
    - Death tracker
    - Timeline scrollbar
- Timeline improvements
    - Filter actions
- Log view, display detailed log of fight with nice visual styling
- Trigger view
- Search and filter past encounters
- Stats, view detailed information about your best runs and parses