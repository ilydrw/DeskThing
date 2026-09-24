import React from 'react'

const BluetoothPage: React.FC = () => {
  return (
    <div className="w-full h-full p-8 flex flex-col overflow-y-auto">
      <h1 className="text-3xl font-bold mb-6 text-white">Bluetooth Settings</h1>
      <div className="w-full flex-col flex items-center justify-center h-full space-y-8">
        <div className="bg-gray-800 p-8 rounded-lg shadow-lg text-center border border-green-500/20 transition-shadow hover:shadow-green-500/20 hover:shadow-xl">
          <p className="text-3xl mb-4">🛠️ Coming Soon!</p>
          <p className="text-xl text-gray-300">
            Bluetooth functionality will be available in a future update
          </p>
        </div>
        <div className="flex flex-col items-center bg-gray-800 p-8 rounded-lg shadow-lg border border-green-500/20 transition-shadow hover:shadow-green-500/20 hover:shadow-xl">
          <p className="text-lg text-gray-300">Bluetooth planning is tracked in the roadmap.</p>
          <p className="text-gray-400 italic">
            USB and local-network reliability remain the current priority.
          </p>
        </div>
      </div>
    </div>
  )
}

export default BluetoothPage
