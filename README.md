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

Past encounter data is stored and can be replayed. You can access past encounters via the "History" resource found in the side menu of your main parse page. Search and filtering options for past encounter data is planned.


## Custom Plugins

Eventually you'll be able to add custom third party plugins that can extends FFLiveParse's functionality and provide additional data and triggers.

Some custom plugin ideas...

- UWU Jail Plugin that works for PS4 users
- Text-to-speech triggers to help line up raid buffs


## Triggers

It is now possible to run custom triggers. Two trigger formats are suported, ACT XML trigger snippets and a new custom trigger format specifically for FFLiveParse. Currently only text-to-speech triggers are supported.

It is possible to create complex triggers using the new trigger format. The new format is simply an array of JSON objects that define trigger parameters.

Example...
```
[
    {
        "i": "o12s",
        "d": "Alphascape V4.0 (Savage)"
    },
    {
        "i": "o12s-short-stack",
        "d": "Short Stack",
        "p": "o12s",
        "z": "Alphascape V4.0 (Savage)",
        "t": "1A:(.*) gains the effect of (?:Unknown_680|Critical Synchronization Bug) from (?:.*) for 8.00 Seconds",
        "a": "say(nameShortify(match[1]) + 'short stack'); disable('o12s-short-stack'); enable('o12s-short-stack', 5000); }"
    }
]
```
The above trigger calls out the short stack debuff in the Final Omega fight. It then disables the trigger for 5 seconds.

Trigger params...

- i: Trigger identifier (REQUIRED)
- d: Trigger display name
- p: Trigger parent identifier
- z: Limit trigger activation to specific zone
- t: Trigger regex
- a: Javascript code to eval on trigger activation

Custom functions available to trigger eval code...

- say(string text, integer delay): Use TTS to speak 'text.' Optional delay of 'delay' milliseconds.
- do(string tid, integer delay): Execute the action of trigger with 'tid' identifier. Optional delay of 'delay' milliseconds.
- disable(string tid, integer delay): Disable the trigger with 'tid' identifier. Optional delay of 'delay' milliseconds.
- enable(string tid, integer delay): Enable the trigger with 'tid' identifier. Optional delay of 'delay' milliseconds.
- nameShortify(string name): Shorten a name down to first name.


## Running The Server On Your Own Machine

You can run the server on your own machine if you prefer. 

1. Download the appropiate binary for your OS here... https://github.com/chompy/ffliveparse_server/releases
2. Launch the server executable, on Windows it's ffliveparse_server.exe.
3. Perform the steps needed to get the [ACT plugin](https://github.com/chompy/ffliveparse_act_plugin#getting-started) installed except instead of visting ffliveparse.com go to http://127.0.0.1:8081 instead. ACT plugin instructions... https://github.com/chompy/ffliveparse_act_plugin#getting-started
4. Under the 'Upload Server Address' in ACT change it from 'ffliveparse.com:31593' to '127.0.0.1:31593.' Click 'Save / Connect.'


## Todos

- Ability to have user provided custom widgets/plugins.
- Restore functionality from v0.XX
    - Cactbot triggers
- Restore functionality from v1.16
    - Death tracker
    - Timeline scrollbar
- Timeline improvements
    - Filter actions
- Log view, display detailed log of fight with nice visual styling
- Search and filter past encounters
- Stats, view detailed information about your best runs and parses