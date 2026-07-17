import { useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { programsRepo, clientsRepo, exercisesRepo } from '@/db/repo'
import { fullName } from '@/lib/core'

export default function PrintSessionSheet() {
  const { clientId = '', programId = '' } = useParams()
  const navigate = useNavigate()

  const client = useLiveQuery(() => clientsRepo.get(clientId), [clientId])
  const program = useLiveQuery(() => programsRepo.get(programId), [programId])
  const exercises = useLiveQuery(() => exercisesRepo.all(), [])

  useEffect(() => {
    if (client && program && exercises) {
      // Trigger print dialog once data is loaded
      setTimeout(() => {
        window.print()
      }, 500)
    }
  }, [client, program, exercises])

  if (!client || !program || !exercises) return <div className="p-8">Loading print view...</div>

  const exMap = new Map(exercises.map(e => [e.id, e.name]))

  return (
    <div className="bg-white text-black min-h-screen p-8 max-w-4xl mx-auto font-sans">
      <div className="mb-8 pb-4 border-b-2 border-black flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold uppercase tracking-tight">{fullName(client)}</h1>
          <h2 className="text-xl text-gray-600 mt-1">{program.name}</h2>
        </div>
        <div className="text-right text-sm text-gray-500">
          <p>Coachwright</p>
          <p>{new Date().toLocaleDateString()}</p>
        </div>
      </div>

      <div className="space-y-12">
        {program.weeks.map((week) => (
          <div key={week.id} className="break-inside-avoid">
            <h3 className="text-2xl font-bold bg-gray-100 p-2 mb-6 border-l-4 border-black">{week.label}</h3>
            
            <div className="space-y-8 pl-4">
              {week.days.map((day) => (
                <div key={day.id} className="break-inside-avoid">
                  <h4 className="text-xl font-bold mb-4">{day.name}</h4>
                  
                  <div className="space-y-6">
                    {day.blocks.map((block) => (
                      <div key={block.id} className="border border-gray-300 rounded p-4">
                        {block.label && (
                          <div className="font-bold text-gray-800 mb-3 text-lg border-b border-gray-200 pb-1">
                            {block.label} {block.intervalSpec && ` — ${block.intervalSpec}`}
                          </div>
                        )}

                        <table className="w-full text-left text-sm border-collapse">
                          <thead>
                            <tr className="border-b-2 border-gray-300">
                              <th className="py-2 w-1/2">Exercise</th>
                              <th className="py-2 text-center w-16">Sets</th>
                              <th className="py-2 text-center">Load</th>
                              <th className="py-2 text-center">Reps / Time</th>
                            </tr>
                          </thead>
                          <tbody>
                            {block.exercises.map((ex) => {
                              const exName = exMap.get(ex.exerciseId) || 'Unknown Exercise'
                              return (
                                <tr key={ex.id} className="border-b border-gray-200">
                                  <td className="py-3 pr-4 align-top">
                                    <div className="font-semibold text-base">{exName}</div>
                                    {ex.note && <div className="text-xs text-gray-500 mt-1 italic">{ex.note}</div>}
                                    {ex.tempo && <div className="text-xs text-gray-500 mt-1">Tempo: {ex.tempo}</div>}
                                    {ex.restSeconds && <div className="text-xs text-gray-500 mt-1">Rest: {ex.restSeconds}s</div>}
                                  </td>
                                  <td className="py-3 text-center align-top font-bold text-gray-400">
                                    {ex.sets.map((_, i) => <div key={i} className="mb-2 h-8 flex items-center justify-center">{i + 1}</div>)}
                                  </td>
                                  <td className="py-3 text-center align-top px-2">
                                    {ex.sets.map((set, i) => (
                                      <div key={i} className="mb-2 h-8 border border-gray-300 rounded flex items-center justify-center text-gray-400 text-xs">
                                        {set.load ? set.load : '___'}
                                      </div>
                                    ))}
                                  </td>
                                  <td className="py-3 text-center align-top px-2">
                                    {ex.sets.map((set, i) => (
                                      <div key={i} className="mb-2 h-8 border border-gray-300 rounded flex items-center justify-center text-gray-400 text-xs">
                                        {set.reps ? set.reps : set.timeSeconds ? `${set.timeSeconds}s` : '___'}
                                      </div>
                                    ))}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-12 no-print">
        <button 
          onClick={() => navigate(-1)}
          className="px-4 py-2 bg-gray-800 text-white rounded font-medium cursor-pointer"
        >
          ← Back to Client
        </button>
      </div>
    </div>
  )
}
