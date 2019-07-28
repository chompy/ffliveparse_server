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

package database

import (
	"database/sql"
	"log"
	"time"

	"../act"
	"../app"
	"../user"

	_ "github.com/mattn/go-sqlite3" // sqlite driver
	"github.com/olebedev/emitter"
)

// Handler - handle database transaction via event emitter
type Handler struct {
	events   *emitter.Emitter
	database *sql.DB
}

// NewHandler -
func NewHandler(events *emitter.Emitter) (Handler, error) {
	handler := Handler{
		events: events,
	}
	err := handler.Init()
	return handler, err
}

// Init - init the database
func (h *Handler) Init() error {
	var err error
	// open database
	h.database, err = sql.Open("sqlite3", app.DatabasePath+"?_journal=WAL")
	if err != nil {
		return err
	}
	// create tables
	err = CreateUserTable(h.database)
	if err != nil {
		return err
	}
	err = CreatePlayerTable(h.database)
	if err != nil {
		return err
	}
	err = CreateEncounterTable(h.database)
	if err != nil {
		return err
	}
	err = CreateCombatantTable(h.database)
	if err != nil {
		return err
	}
	return nil
}

// Close - close database
func (h *Handler) Close() {
	h.database.Close()
}

// Handle - handle database related events
func (h *Handler) Handle() error {
	for {
		for event := range h.events.On("database:*") {
			if len(event.Args) < 2 {
				log.Println("[DATABASE] Event recieved with too few arguments.")
				continue
			}
			fin := event.Args[0].(chan bool)
			var err error
			switch event.OriginalTopic {
			case "database:save":
				{
					saveObj := event.Args[1]
					switch saveObj.(type) {
					case *user.Data:
						{
							err = SaveUser(saveObj.(*user.Data), h.database)
							break
						}
					case *act.Encounter:
						{
							userID := event.Int(2)
							err = SaveEncounter(userID, saveObj.(*act.Encounter), h.database)
							break
						}
					case *act.Combatant:
						{
							userID := event.Int(2)
							err = SaveCombatant(userID, saveObj.(*act.Combatant), h.database)
							break
						}
					case *act.Player:
						{
							err = SavePlayer(saveObj.(*act.Player), h.database)
							break
						}
					}
					break
				}
			case "database:fetch":
				{
					fetchObj := event.Args[1]
					switch fetchObj.(type) {
					case *user.Data:
						{
							userID := event.Int(2)
							err = FetchUser(userID, h.database, fetchObj.(*user.Data))
							break
						}
					case *act.Encounter:
						{
							userID := event.Int(2)
							encounterUID := event.String(3)
							err = FetchEncounter(userID, encounterUID, h.database, fetchObj.(*act.Encounter))
							break
						}
					}
					break
				}
			case "database:find":
				{
					findObjs := event.Args[1]
					switch findObjs.(type) {
					case *[]user.Data:
						{
							webKey := event.String(2)
							uploadKey := event.String(3)
							err = FindUsers(webKey, uploadKey, h.database, findObjs.(*[]user.Data))
							break
						}
					case *[]act.Encounter:
						{
							userID := event.Int(2)
							offset := event.Int(3)
							query := event.String(4)
							start := event.Args[5].(*time.Time)
							end := event.Args[6].(*time.Time)
							totalResults := event.Args[7].(*int)
							err = FindEncounters(
								userID,
								offset,
								query,
								start,
								end,
								h.database,
								findObjs.(*[]act.Encounter),
								totalResults,
							)
							break
						}
					case *[]act.Combatant:
						{
							userID := event.Int(2)
							encounterUID := event.String(3)
							err = FindEncounterCombatants(userID, encounterUID, h.database, findObjs.(*[]act.Combatant))
							break
						}
					case *[]act.PlayerStat:
						{
							zone := event.String(2)
							err = FindPlayerStats(zone, h.database, findObjs.(*[]act.PlayerStat))
						}
					}
					break
				}
			case "database:total_count":
				{
					res := event.Args[1].(*int)
					table := event.String(2)
					switch table {
					case "encounter":
						{
							err = TotalCountEncounter(h.database, res)
							break
						}
					case "combatant":
						{
							err = TotalCountCombatant(h.database, res)
							break
						}
					case "player":
						{
							err = TotalCountPlayer(h.database, res)
							break
						}
					case "user":
						{
							err = TotalCountUser(h.database, res)
							break
						}
					}
					break
				}
			case "database:find_encounter_clean_up":
				{
					encounterUIDs := event.Args[1].(*[]string)
					err = FindEncounterNeedClean(h.database, encounterUIDs)
					break
				}
			case "database:flag_encounter_clean":
				{
					encounterUID := event.String(1)
					err = FlagEncounterClean(encounterUID, h.database)
					break
				}
			}
			if err != nil {
				log.Println("[DATABASE] Error", event.OriginalTopic, err)
			}
			fin <- true
		}
	}
}
