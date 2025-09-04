'use client';

import { useState } from 'react';

export default function ClubActivitiesTest() {
  const [jsonData, setJsonData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchJsonData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/club/json');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setJsonData(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-extrabold text-gray-900 mb-2">
            Club Activities API
          </h1>
          <p className="text-lg text-gray-700 max-w-2xl mx-auto">
            View and compare your club's Strava activities for this week and last week. Explore both JSON and iframe endpoints for easy integration and visualization.
          </p>
        </div>

        {/* API Endpoints Info */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Endpoints Overview</h2>
          <div className="space-y-3">
            <div className="flex items-center space-x-3">
              <span className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-semibold">
                GET
              </span>
              <code className="bg-gray-100 px-3 py-1 rounded text-base">
                /api/club/json
              </code>
              <span className="text-gray-600">Returns club activities as JSON</span>
            </div>
            <div className="flex items-center space-x-3">
              <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-semibold">
                GET
              </span>
              <code className="bg-gray-100 px-3 py-1 rounded text-base">
                /api/club/iframe
              </code>
              <span className="text-gray-600">Returns a styled HTML report for embedding</span>
            </div>
          </div>
        </div>

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* JSON API Section */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Live JSON Data</h2>
            <p className="text-gray-600 mb-2">Click below to fetch the latest club activities in JSON format.</p>
            <button
              onClick={fetchJsonData}
              disabled={loading}
              className="mb-4 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white font-semibold py-2 px-4 rounded-lg transition duration-200"
            >
              {loading ? 'Loading...' : 'Fetch JSON Data'}
            </button>
            {error && (
              <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                <strong>Error:</strong> {error}
              </div>
            )}
            {jsonData && (
              <div className="bg-gray-50 rounded-lg p-4 overflow-auto max-h-96">
                <pre className="text-sm text-gray-800">
                  {JSON.stringify(jsonData, null, 2)}
                </pre>
              </div>
            )}
          </div>

          {/* Iframe Section */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Visual Report (iframe)</h2>
            <p className="text-gray-600 mb-2">
              Embed this interactive report in your website or dashboard. It displays weekly club activity stats and details in a clean, responsive layout.
            </p>
            <div className="border rounded-lg overflow-hidden">
              <iframe
                src="/api/club/iframe"
                className="w-full h-96 border-0"
                title="Club Activities Report"
              />
            </div>
            <div className="mt-4 text-sm text-gray-500">
              <strong>Embed code:</strong>
              <code className="block mt-2 bg-gray-100 p-2 rounded text-xs break-all">
                {typeof window !== 'undefined' ? `<iframe src="${window.location.origin}/api/club/iframe" width="100%" height="400" frameborder="0"></iframe>` : '<iframe src="/api/club/iframe" width="100%" height="400" frameborder="0"></iframe>'}
              </code>
            </div>
          </div>
        </div>

        {/* Documentation */}
        <div className="mt-8 bg-white rounded-lg shadow-md p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">API Usage & Documentation</h2>
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Query Parameters</h3>
              <div className="bg-gray-50 rounded-lg p-4">
                <ul className="space-y-2 text-sm">
                  <li><code className="bg-gray-200 px-2 py-1 rounded">clubId</code> <span className="text-gray-700">(optional) — Strava club ID, defaults to your configured club</span></li>
                </ul>
              </div>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Authentication</h3>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-700">
                  Pass your Strava access token in the Authorization header:
                </p>
                <code className="block mt-2 bg-gray-200 p-2 rounded text-xs">
                  Authorization: Bearer YOUR_ACCESS_TOKEN
                </code>
                <p className="text-sm text-gray-500 mt-2">
                  If no token is provided, the API will use local demo data (if enabled).
                </p>
              </div>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Response Format</h3>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-700 mb-2">
                  The JSON endpoint returns activities grouped by week, with summary statistics and details:
                </p>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>• <strong>summary</strong> — Aggregated stats for each week</li>
                  <li>• <strong>activities</strong> — Detailed activity lists</li>
                  <li>• <strong>date_ranges</strong> — Week start/end dates</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
