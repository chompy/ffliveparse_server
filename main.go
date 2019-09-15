package main

import (
	"flag"
	"log"

	"github.com/olebedev/emitter"

	"./internal/pkg/act"
	"./internal/pkg/app"
	"./internal/pkg/storage"
	"./internal/pkg/user"
	"./internal/pkg/web"
)

// ActListenUDPPort - Port act server will listen on
const ActListenUDPPort uint16 = 31593

// HTTPListenTCPPort - Port http server will listen on
const HTTPListenTCPPort uint16 = 8081

func main() {
	// define+parse flags
	devModePtr := flag.Bool("dev", false, "Start server in development mode.")
	httpPort := flag.Int("http-port", int(HTTPListenTCPPort), "Set HTTP listen port.")
	actPort := flag.Int("act-port", int(ActListenUDPPort), "Set UDP port to recieved data from ACT on.")
	flag.Parse()

	// log start
	log.Printf("%s -- Version %s\n", app.Name, app.GetVersionString())
	if *devModePtr {
		log.Println("Development mode enabled.")
	}

	// create event emitter
	events := emitter.Emitter{}

	// create usage stat collector
	usageStatCollector := app.NewStatCollector(&events)
	usageStatCollector.TakeSnapshot()
	go usageStatCollector.Start()

	// create storage handler
	sqliteStorageHandler, err := storage.NewSqliteHandler(app.DatabasePath)
	if err != nil {
		panic(err)
	}
	fileStorageHandler, err := storage.NewFileHandler(app.FileStorePath)
	storageManager := storage.NewManager()
	err = storageManager.AddHandler(&fileStorageHandler)
	if err != nil {
		panic(err)
	}
	err = storageManager.AddHandler(&sqliteStorageHandler)
	if err != nil {
		panic(err)
	}

	// create user manager
	userManager := user.NewManager(&storageManager)

	// create act manager
	actManager := act.NewManager(&events, &storageManager, &userManager, *devModePtr)
	go actManager.SnapshotListener()
	defer actManager.ClearAllSessions()

	// player stat tracker on seperate threads
	playerStatTracker := act.NewStatsTracker(&storageManager)
	go playerStatTracker.Start()

	// clean up old encounters
	go storageManager.StartCleanUp()
	go act.CleanUpEncounters(&storageManager)

	// start http server
	go web.HTTPStartServer(uint16(*httpPort), &userManager, &actManager, &events, &storageManager, &usageStatCollector, &playerStatTracker, *devModePtr)

	// start act listen server
	act.Listen(uint16(*actPort), &actManager)
}
