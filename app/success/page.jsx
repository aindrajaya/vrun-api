'use client';

import { useState, useEffect, Suspense } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

function SuccessContent() {
  const [countdown, setCountdown] = useState(10);
  const [orderDetails, setOrderDetails] = useState(null);
  const searchParams = useSearchParams();
  
  // Get order details from URL parameters
  useEffect(() => {
    const orderId = searchParams.get('order_id');
    const amount = searchParams.get('amount');
    const status = searchParams.get('transaction_status');
    
    if (orderId || amount || status) {
      setOrderDetails({
        orderId: orderId || 'N/A',
        amount: amount || 'N/A',
        status: status || 'success'
      });
    }
  }, [searchParams]);

  // Countdown timer for auto-redirect
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          window.location.href = 'https://werunpalestina.id';
          return 0;
        }
        return prev - 1;
      });
    }, 100000000);

    return () => clearInterval(timer);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-blue-50">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm fixed top-0 left-0 right-0 z-50 border-b border-green-100">
        <nav className="mt-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <Link href="https://werunpalestina.framer.website" className="inline-block">
                  <Image 
                    src="/images/Logo1.svg" 
                    alt="We Run Palestina Logo" 
                    width={100} 
                    height={32} 
                    className="sm:w-[120px] sm:h-[40px] hover:opacity-80 transition-opacity duration-200" 
                  />
                </Link>
              </div>
            </div>
          </div>
        </nav>
      </header>

      {/* Main Content */}
      <main className="pt-32 pb-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          {/* Success Animation and Message */}
          <div className="text-center">
            {/* Success Icon with Animation */}
            <div className="flex justify-center mb-8 mt-12">
              <div className="relative">
                {/* Animated Success Circle */}
                <div className="w-24 h-24 sm:w-32 sm:h-32 bg-gradient-to-r from-green-400 to-green-600 rounded-full flex items-center justify-center shadow-lg animate-pulse">
                  <svg 
                    className="w-12 h-12 sm:w-16 sm:h-16 text-white animate-bounce" 
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                  >
                    <path 
                      strokeLinecap="round" 
                      strokeLinejoin="round" 
                      strokeWidth={3} 
                      d="M5 13l4 4L19 7" 
                    />
                  </svg>
                </div>
                
                {/* Floating particles animation */}
                <div className="absolute -top-2 -right-2 w-4 h-4 bg-yellow-400 rounded-full animate-ping"></div>
                <div className="absolute -bottom-2 -left-2 w-3 h-3 bg-blue-400 rounded-full animate-ping" style={{animationDelay: '0.5s'}}></div>
                <div className="absolute top-1/2 -right-4 w-2 h-2 bg-pink-400 rounded-full animate-ping" style={{animationDelay: '1s'}}></div>
              </div>
            </div>

            {/* Success Message */}
            <div className="space-y-4 mb-8 mt-12">
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900">
                🎉 Pembayaran Berhasil!
              </h1>
              <p className="text-lg sm:text-xl text-gray-600 max-w-2xl mx-auto">
                Terima kasih atas pembayaran Anda dan telah bergabung dengan We Run Palestina. Pendaftaran Anda telah berhasil dikonfirmasi.
              </p>
            </div>

            {/* Order Details Card */}
            {orderDetails && (
              <div className="bg-white rounded-2xl shadow-lg border border-green-100 p-6 sm:p-8 mb-8 max-w-2xl mx-auto">
                <h2 className="text-xl sm:text-2xl font-semibold text-gray-900 mb-6">Detail Pembayaran</h2>
                <div className="space-y-4">
                  <div className="flex justify-between items-center py-2 border-b border-gray-100">
                    <span className="text-gray-600">Order ID:</span>
                    <span className="font-mono text-sm bg-gray-100 px-3 py-1 rounded-lg">
                      {orderDetails.orderId}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-gray-100">
                    <span className="text-gray-600">Status:</span>
                    <span className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-medium">
                      Berhasil
                    </span>
                  </div>
                  {orderDetails.amount !== 'N/A' && (
                    <div className="flex justify-between items-center py-2">
                      <span className="text-gray-600">Total Pembayaran:</span>
                      <span className="text-xl font-bold text-green-600">
                        Rp {parseInt(orderDetails.amount).toLocaleString('id-ID')}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* What's Next Section */}
            <div className="bg-gradient-to-r from-green-100 to-blue-100 rounded-2xl p-6 sm:p-8 mb-8">
              <h2 className="text-xl sm:text-2xl font-semibold text-gray-900 mb-4">
                Apa Selanjutnya? 🚀
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-left">
                <div className="bg-white rounded-xl p-4 shadow-sm">
                  <div className="text-2xl mb-2">📧</div>
                  <h3 className="font-semibold text-gray-900 mb-1">Email Konfirmasi</h3>
                  <p className="text-sm text-gray-600">
                    Anda akan menerima email konfirmasi dalam beberapa menit
                  </p>
                </div>
                <div className="bg-white rounded-xl p-4 shadow-sm">
                  <div className="text-2xl mb-2">📱</div>
                  <h3 className="font-semibold text-gray-900 mb-1">Download Strava</h3>
                  <p className="text-sm text-gray-600">
                    Pastikan aplikasi Strava terinstall untuk tracking
                  </p>
                </div>
                <div className="bg-white rounded-xl p-4 shadow-sm sm:col-span-2 lg:col-span-1">
                  <div className="text-2xl mb-2">🏃‍♂️</div>
                  <h3 className="font-semibold text-gray-900 mb-1">Mulai Berlari</h3>
                  <p className="text-sm text-gray-600">
                    Event dimulai dan siap untuk berlari bersama
                  </p>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-4 sm:space-y-0 sm:space-x-4 sm:flex sm:justify-center">
              <Link 
                href="https://werunpalestina.id"
                className="inline-block w-full sm:w-auto bg-gradient-to-r from-green-600 to-green-700 text-white py-4 px-8 rounded-full font-semibold text-lg hover:from-green-700 hover:to-green-800 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
              >
                Kembali ke Beranda
              </Link>
              <Link 
                href="https://www.strava.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block w-full sm:w-auto bg-white text-gray-900 py-4 px-8 rounded-full font-semibold text-lg border-2 border-gray-200 hover:border-gray-300 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
              >
                Buka Strava
              </Link>
            </div>

            {/* Auto-redirect Notice */}
            <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-xl">
              <p className="text-blue-800 text-sm">
                <span className="font-semibold">Auto-redirect:</span> Anda akan diarahkan ke halaman utama dalam{' '}
                <span className="font-bold text-blue-900">{countdown}</span> detik...
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-gradient-to-r from-gray-900 to-black text-white py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <Image 
              src="/images/Logo2.svg" 
              alt="We Run Palestina Logo" 
              width={120} 
              height={40} 
              className="mx-auto mb-4 opacity-80" 
            />
            <p className="text-gray-400 text-sm">
              © 2025 We Run Palestina. Running for Humanity.
            </p>
            <p className="text-gray-500 text-xs mt-2">
              Virtual Running Event untuk Solidaritas Kemanusiaan Palestina
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function SuccessPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-green-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    }>
      <SuccessContent />
    </Suspense>
  );
}
