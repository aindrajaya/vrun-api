'use client';

import { useState } from 'react';

export default function ClubActivitiesTest() {
  const [jsonData, setJsonData] = useState(null);
  const [imagesData, setImagesData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingImages, setLoadingImages] = useState(false);
  const [error, setError] = useState(null);
  const [imagesError, setImagesError] = useState(null);

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

  const fetchImagesData = async () => {
    setLoadingImages(true);
    setImagesError(null);
    
    try {
      const response = await fetch('/api/club/images');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setImagesData(data);
    } catch (err) {
      setImagesError(err.message);
    } finally {
      setLoadingImages(false);
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
          <p className="text-lg text-gray-700 max-w-2xl mx-auto mb-4">
            View and compare your club's Strava activities for this week and last week. Explore both JSON and iframe endpoints for easy integration and visualization.
          </p>
          <div className="flex justify-center space-x-4">
            <a 
              href="/register"
              className="bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-6 rounded-lg transition duration-200"
            >
              Register for We Run Palestina
            </a>
          </div>
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
            <div className="flex items-center space-x-3">
              <span className="bg-purple-100 text-purple-800 px-3 py-1 rounded-full text-sm font-semibold">
                GET
              </span>
              <code className="bg-gray-100 px-3 py-1 rounded text-base">
                /api/club/images
              </code>
              <span className="text-gray-600">Returns activities with photos and route maps</span>
            </div>
            <div className="flex items-center space-x-3">
              <span className="bg-orange-100 text-orange-800 px-3 py-1 rounded-full text-sm font-semibold">
                GET
              </span>
              <code className="bg-gray-100 px-3 py-1 rounded text-base">
                /api/club/images/iframe
              </code>
              <span className="text-gray-600">Visual report with photos and route maps</span>
            </div>
          </div>
        </div>

        {/* Three Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* JSON API Section */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Basic JSON Data</h2>
            <p className="text-gray-600 mb-2">Standard activity data without images.</p>
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

          {/* Images API Section */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Activities with Images</h2>
            <p className="text-gray-600 mb-2">Enhanced data including photos and route maps.</p>
            <button
              onClick={fetchImagesData}
              disabled={loadingImages}
              className="mb-4 bg-purple-500 hover:bg-purple-600 disabled:bg-purple-300 text-white font-semibold py-2 px-4 rounded-lg transition duration-200"
            >
              {loadingImages ? 'Loading...' : 'Fetch Images Data'}
            </button>
            {imagesError && (
              <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                <strong>Error:</strong> {imagesError}
              </div>
            )}
            {imagesData && (
              <div className="bg-gray-50 rounded-lg p-4 overflow-auto max-h-96">
                <pre className="text-sm text-gray-800">
                  {JSON.stringify(imagesData, null, 2)}
                </pre>
              </div>
            )}
          </div>

          {/* Iframe Section */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Visual Reports</h2>
            <p className="text-gray-600 mb-4">
              Interactive reports for embedding in your website.
            </p>
            
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-2">Basic Report</h3>
                <div className="border rounded-lg overflow-hidden">
                  <iframe
                    src="/api/club/iframe"
                    className="w-full h-48 border-0"
                    title="Club Activities Basic Report"
                  />
                </div>
              </div>
              
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-2">With Images</h3>
                <div className="border rounded-lg overflow-hidden">
                  <iframe
                    src="/api/club/images/iframe"
                    className="w-full h-48 border-0"
                    title="Club Activities with Images"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Documentation */}
        <div className="mt-8 bg-white rounded-lg shadow-md p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Image API Documentation</h2>
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Getting Activity Images</h3>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-700 mb-3">
                  Based on the Strava OpenAPI specification, there are several ways to get activity images:
                </p>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li>• <strong>Activity Photos</strong> — Photos uploaded by athletes during activities</li>
                  <li>• <strong>Route Maps</strong> — Static map images generated from activity GPS data</li>
                  <li>• <strong>Athlete Profile Images</strong> — Profile photos from the athlete data</li>
                </ul>
              </div>
            </div>
            
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Image Endpoints Parameters</h3>
              <div className="bg-gray-50 rounded-lg p-4">
                <ul className="space-y-2 text-sm">
                  <li><code className="bg-gray-200 px-2 py-1 rounded">includePhotos</code> <span className="text-gray-700">(default: true) — Include activity photos</span></li>
                  <li><code className="bg-gray-200 px-2 py-1 rounded">includeRouteMap</code> <span className="text-gray-700">(default: true) — Generate route map images</span></li>
                  <li><code className="bg-gray-200 px-2 py-1 rounded">clubId</code> <span className="text-gray-700">(optional) — Specific club ID to query</span></li>
                </ul>
              </div>
            </div>
            
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Authentication for Images</h3>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-700">
                  To access activity images, provide your Strava access token:
                </p>
                <code className="block mt-2 bg-gray-200 p-2 rounded text-xs">
                  Authorization: Bearer YOUR_ACCESS_TOKEN
                </code>
                <p className="text-sm text-gray-500 mt-2">
                  Requires <code>activity:read</code> or <code>activity:read_all</code> scope for accessing detailed activity data including photos.
                </p>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Map Services Integration</h3>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-700 mb-2">
                  Route maps are generated using activity GPS polylines with:
                </p>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>• <strong>Google Maps Static API</strong> — High-quality route visualization</li>
                  <li>• <strong>Mapbox Static Images API</strong> — Customizable styling options</li>
                </ul>
                <p className="text-sm text-gray-500 mt-2">
                  Configure <code>GOOGLE_MAPS_API_KEY</code> or <code>MAPBOX_ACCESS_TOKEN</code> in your environment variables.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
