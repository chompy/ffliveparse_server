package act

import (
	"log"
	"os"

	"time"

	"../app"
	"../data"
	"../storage"
)

// CleanUpEncounters - delete log files for old encounters
func CleanUpEncounters(sm *storage.Manager) {
	for range time.Tick(app.EncounterCleanUpRate * time.Millisecond) {
		log.Println("[CLEAN] Begin log clean up.")
		// fetch encounters
		res, _, err := sm.Fetch(map[string]interface{}{
			"type":      storage.StoreTypeEncounter,
			"log_clean": "1",
		})
		if err != nil {
			log.Println("[CLEAN] Error...", err)
			continue
		}
		encounters := make([]data.Encounter, len(res))
		for _, encounter := range res {
			encounters = append(encounters, encounter.(data.Encounter))
		}
		// itterate
		store := make([]interface{}, len(encounters))
		for index := range encounters {
			encounters[index].HasLogs = false
			// check if log exists
			uid := encounters[index].UID
			logPath := getPermanentLogPath(uid)
			if _, err := os.Stat(logPath); os.IsNotExist(err) {
				// update database if log file is missing
				log.Println("[CLEAN] Delete log for", uid, "(log flag missing from database)")
				continue
			}
			// delete log file
			err := os.Remove(logPath)
			if err != nil {
				log.Println("[CLEAN] Error...", uid, err.Error())
				continue
			}
			store[index] = encounters[index]
		}
		// flag
		sm.Store(store)
	}
}
