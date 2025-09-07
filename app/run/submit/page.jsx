'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';

export default function SubmitPage() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    stravaActivity: '',
    distance: '',
    duration: '',
    proof: null
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState('');
  const [submitData, setSubmitData] = useState(null);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    setFormData(prev => ({
      ...prev,
      proof: file
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitStatus('');

    try {
      const formDataToSend = new FormData();
      Object.keys(formData).forEach(key => {
        if (formData[key]) {
          formDataToSend.append(key, formData[key]);
        }
      });

      const response = await fetch('/api/run/submit', {
        method: 'POST',
        body: formDataToSend,
      });

      const result = await response.json();

      if (response.ok) {
        setSubmitStatus('success');
        setSubmitData(result);
        setFormData({ 
          name: '', 
          email: '', 
          phone: '', 
          stravaActivity: '', 
          distance: '', 
          duration: '', 
          proof: null 
        });
      } else {
        setSubmitStatus('error');
        console.error('Submission failed:', result.error);
      }
    } catch (error) {
      setSubmitStatus('error');
      console.error('Submission error:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="bg-white fixed top-0 left-0 right-0 z-50">
        <nav className="mt-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <Link href="https://werunpalestina.framer.website" className="inline-block">
                  <Image src="/images/Logo1.svg" alt="Logo" width={100} height={32} className="sm:w-[120px] sm:h-[40px] hover:opacity-80 transition-opacity duration-200" />
                </Link>
              </div>
            </div>
            
            {/* Desktop Navigation */}
            {/* <div className="hidden lg:block">
              <div className="ml-10 flex items-baseline space-x-6 xl:space-x-8">
                <a href="https://werunpalestina.framer.website" className="text-gray-900 hover:text-gray-700 px-3 py-2 text-sm font-medium transition-colors">Beranda</a>
                <a href="#" className="text-gray-900 hover:text-gray-700 px-3 py-2 text-sm font-medium transition-colors">Tentang</a>
                <a href="#" className="text-gray-900 hover:text-gray-700 px-3 py-2 text-sm font-medium transition-colors">Acara</a>
                <a href="#" className="text-gray-900 hover:text-gray-700 px-3 py-2 text-sm font-medium transition-colors">Leaderboards</a>
                <a href="#" className="text-gray-900 hover:text-gray-700 px-3 py-2 text-sm font-medium transition-colors">Kontak Kami</a>
                <button className="border border-gray-300 rounded-full px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                  Hubungi Kami
                </button>
              </div>
            </div> */}

            {/* Mobile menu button */}
            {/* <div className="lg:hidden">
              <button className="inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-green-500">
                <svg className="h-6 w-6" stroke="currentColor" fill="none" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            </div> */}
          </div>
        </nav>
      </header>

      {/* Main Content */}
      <main className="pt-20 pb-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-stretch">
            {/* Left Side - Image and Text */}
            <div className="flex flex-col justify-center order-2 lg:order-1">
              {/* Hero Image */}
              <div className="relative flex items-center justify-center p-4 sm:p-6 lg:p-8">
                <Image 
                  src="/images/HeroImageSubmit.svg" 
                  alt="We Run Palestina Submit Results" 
                  width={500} 
                  height={500}
                  className="w-[80%] h-auto max-w-sm sm:max-w-md lg:max-w-lg rounded-lg"
                  priority
                />
              </div>
            </div>

            {/* Right Side - Submit Form */}
            <div className="bg-white p-4 sm:p-6 lg:p-8 order-1 lg:order-2">
              <div className="space-y-4 sm:space-y-6">
                <div className="text-center">
                  <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-3">
                    Submit Hasil Lari
                  </h2>
                  <p className="text-gray-600 text-sm sm:text-base mb-4 leading-relaxed px-2">
                    Upload hasil lari Anda untuk We Run Palestina dan bergabung
                    dengan leaderboard komunitas.
                  </p>
                  <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 sm:p-4 mb-4 sm:mb-6">
                    <p className="text-black font-semibold text-base sm:text-lg">
                      Pastikan hasil lari dari aplikasi Strava Anda
                    </p>
                  </div>
                </div>

                {submitStatus === 'success' && (
                  <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl text-sm sm:text-base">
                    <div className="font-semibold mb-2">Hasil berhasil disubmit! 🎉</div>
                    <div className="mb-2">
                      ID Submission: <span className="font-mono">{submitData?.submissionId}</span>
                    </div>
                    <div className="mb-2">
                      Jarak: <span className="font-semibold">{submitData?.distance} km</span>
                    </div>
                    <div className="mb-2">
                      Waktu: <span className="font-semibold">{submitData?.duration}</span>
                    </div>
                    <div className="mb-3">
                      Status: <span className="font-bold text-green-600">Menunggu Verifikasi</span>
                    </div>
                    <div className="text-xs text-green-600">
                      Hasil Anda akan diverifikasi dalam 1x24 jam dan akan muncul di leaderboard.
                    </div>
                  </div>
                )}

                {submitStatus === 'error' && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm sm:text-base">
                    Terjadi kesalahan. Silakan coba lagi.
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
                  <div className="space-y-2">
                    <input
                      type="text"
                      name="name"
                      placeholder="Nama Lengkap"
                      value={formData.name}
                      onChange={handleInputChange}
                      required
                      className="w-full px-4 sm:px-6 lg:px-8 py-1 sm:py-2 lg:py-4 text-base sm:text-lg lg:text-xl border-2 border-gray-200 rounded-full focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all duration-200 text-gray-900 placeholder-gray-500"
                    />
                  </div>

                  <div className="space-y-2">
                    <input
                      type="email"
                      name="email"
                      placeholder="Email"
                      value={formData.email}
                      onChange={handleInputChange}
                      required
                      className="w-full px-4 sm:px-6 lg:px-8 py-1 sm:py-2 lg:py-4 text-base sm:text-lg lg:text-xl border-2 border-gray-200 rounded-full focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all duration-200 text-gray-900 placeholder-gray-500"
                    />
                  </div>

                  <div className="space-y-2">
                    <input
                      type="tel"
                      name="phone"
                      placeholder="No. Handphone"
                      value={formData.phone}
                      onChange={handleInputChange}
                      required
                      className="w-full px-4 sm:px-6 lg:px-8 py-1 sm:py-2 lg:py-4 text-base sm:text-lg lg:text-xl border-2 border-gray-200 rounded-full focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all duration-200 text-gray-900 placeholder-gray-500"
                    />
                  </div>

                  <div className="space-y-2">
                    <input
                      type="url"
                      name="stravaActivity"
                      placeholder="Link Aktivitas Strava"
                      value={formData.stravaActivity}
                      onChange={handleInputChange}
                      required
                      className="w-full px-4 sm:px-6 lg:px-8 py-1 sm:py-2 lg:py-4 text-base sm:text-lg lg:text-xl border-2 border-gray-200 rounded-full focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all duration-200 text-gray-900 placeholder-gray-500"
                    />
                    <p className="text-xs sm:text-sm text-gray-500 px-4">
                      Contoh: https://www.strava.com/activities/12345678
                    </p>
                  </div>

                  <div className="space-y-2">
                    <input
                      type="number"
                      name="distance"
                      placeholder="Jarak (km)"
                      value={formData.distance}
                      onChange={handleInputChange}
                      required
                      min="0"
                      step="0.1"
                      className="w-full px-4 sm:px-6 lg:px-8 py-1 sm:py-2 lg:py-4 text-base sm:text-lg lg:text-xl border-2 border-gray-200 rounded-full focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all duration-200 text-gray-900 placeholder-gray-500"
                    />
                  </div>

                  <div className="space-y-2">
                    <input
                      type="text"
                      name="duration"
                      placeholder="Durasi (contoh: 01:30:45)"
                      value={formData.duration}
                      onChange={handleInputChange}
                      required
                      pattern="[0-9]{2}:[0-9]{2}:[0-9]{2}"
                      className="w-full px-4 sm:px-6 lg:px-8 py-1 sm:py-2 lg:py-4 text-base sm:text-lg lg:text-xl border-2 border-gray-200 rounded-full focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all duration-200 text-gray-900 placeholder-gray-500"
                    />
                    <p className="text-xs sm:text-sm text-gray-500 px-4">
                      Format: HH:MM:SS (jam:menit:detik)
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div className="w-full">
                      <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors">
                        <div className="flex flex-col items-center justify-center pt-5 pb-6">
                          <svg className="w-8 h-8 mb-4 text-gray-500" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 16">
                            <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 13h3a3 3 0 0 0 0-6h-.025A5.56 5.56 0 0 0 16 6.5 5.5 5.5 0 0 0 5.207 5.021C5.137 5.017 5.071 5 5 5a4 4 0 0 0 0 8h2.167M10 15V6m0 0L8 8m2-2 2 2"/>
                          </svg>
                          <p className="mb-2 text-sm text-gray-500">
                            <span className="font-semibold">Upload Screenshot</span> dari Strava
                          </p>
                          <p className="text-xs text-gray-500">PNG, JPG (MAX. 10MB)</p>
                          <p className="text-xs text-gray-400 mt-1">Wajib upload screenshot hasil lari dari aplikasi Strava</p>
                        </div>
                        <input
                          type="file"
                          name="proof"
                          onChange={handleFileChange}
                          accept="image/*"
                          required
                          className="hidden"
                        />
                      </label>
                      {formData.proof && (
                        <p className="text-sm text-green-600 mt-2 px-4">
                          File terpilih: {formData.proof.name}
                        </p>
                      )}
                      <p className="text-xs text-gray-500 mt-2 px-4">
                        <strong>Catatan:</strong> File akan disimpan sementara untuk proses verifikasi. 
                        Pastikan screenshot menunjukkan jarak, waktu, dan tanggal lari yang sesuai.
                      </p>
                    </div>
                  </div>

                  <div className="pt-4">
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full bg-black text-white py-4 sm:py-5 px-6 rounded-full font-semibold text-base sm:text-lg hover:bg-gray-400 disabled:bg-gray-400 disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
                    >
                      {isSubmitting ? (
                        <span className="flex items-center justify-center">
                          <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Mengirim...
                        </span>
                      ) : (
                        'Submit Hasil Lari'
                      )}
                    </button>
                  </div>
                  
                  <div className="text-center pt-4">
                    <p className="text-xs sm:text-sm text-gray-500 px-2">
                      Dengan mengirim hasil, Anda menyetujui{' '}
                      <a href="#" className="text-green-600 hover:text-green-700 font-medium">
                        syarat dan ketentuan
                      </a>{' '}
                      yang berlaku.
                    </p>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      {/* <footer className="bg-black text-white mt-12 sm:mt-16 lg:mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 lg:py-12">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8">
            
            <div className="space-y-4 col-span-1 sm:col-span-2 lg:col-span-1">
              <Image src="/images/Logo2.svg" alt="Logo" width={120} height={40} className="w-28 sm:w-32" />
              <p className="text-gray-400 text-sm leading-relaxed">
                Virtual Running Event ke-pertama "Running for Humanity"
                sebagai bentuk solidaritas kemanusiaan untuk Palestina
              </p>
              <div>
                <h4 className="font-semibold mb-2 text-sm sm:text-base">Alamat Kantor</h4>
                <p className="text-gray-400 text-sm">
                  Kota Madiun, Jawa Timur
                </p>
              </div>
            </div>

            
            <div className="col-span-1">
              <h4 className="font-semibold mb-3 sm:mb-4 text-sm sm:text-base">Menu</h4>
              <ul className="space-y-2 text-sm text-gray-400">
                <li><a href="/" className="hover:text-white transition-colors">Beranda</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Tentang Kami</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Konsep Acara</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Leaderboard</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Kontak Kami</a></li>
              </ul>
            </div>

            
            <div className="col-span-1">
              <h4 className="font-semibold mb-3 sm:mb-4 text-sm sm:text-base">Support</h4>
              <ul className="space-y-2 text-sm text-gray-400">
                <li><a href="#" className="hover:text-white transition-colors">Informasi Pendaftaran</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Informasi Sponsorship</a></li>
              </ul>
            </div>

            
            <div className="col-span-1 sm:col-span-2 lg:col-span-1">
              <h4 className="font-semibold mb-3 sm:mb-4 text-sm sm:text-base">Social Media</h4>
              <div className="flex space-x-4">
                <a href="#" className="text-gray-400 hover:text-white transition-colors">
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M24 4.557c-.883.392-1.832.656-2.828.775 1.017-.609 1.798-1.574 2.165-2.724-.951.564-2.005.974-3.127 1.195-.897-.957-2.178-1.555-3.594-1.555-3.179 0-5.515 2.966-4.797 6.045-4.091-.205-7.719-2.165-10.148-5.144-1.29 2.213-.669 5.108 1.523 6.574-.806-.026-1.566-.247-2.229-.616-.054 2.281 1.581 4.415 3.949 4.89-.693.188-1.452.232-2.224.084.626 1.956 2.444 3.379 4.6 3.419-2.07 1.623-4.678 2.348-7.29 2.04 2.179 1.397 4.768 2.212 7.548 2.212 9.142 0 14.307-7.721 13.995-14.646.962-.695 1.797-1.562 2.457-2.549z"/>
                  </svg>
                </a>
                <a href="#" className="text-gray-400 hover:text-white transition-colors">
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M22.46 6c-.77.35-1.6.58-2.46.69.88-.53 1.56-1.37 1.88-2.38-.83.5-1.75.85-2.72 1.05C18.37 4.5 17.26 4 16 4c-2.35 0-4.27 1.92-4.27 4.29 0 .34.04.67.11.98C8.28 9.09 5.11 7.38 3 4.79c-.37.63-.58 1.37-.58 2.15 0 1.49.75 2.81 1.91 3.56-.71 0-1.37-.2-1.95-.5v.03c0 2.08 1.48 3.82 3.44 4.21a4.22 4.22 0 0 1-1.93.07 4.28 4.28 0 0 0 4 2.98 8.521 8.521 0 0 1-5.33 1.84c-.34 0-.68-.02-1.02-.06C3.44 20.29 5.7 21 8.12 21 16 21 20.33 14.46 20.33 8.79c0-.19 0-.37-.01-.56.84-.6 1.56-1.36 2.14-2.23z"/>
                  </svg>
                </a>
              </div>
            </div>
          </div>

          <div className="border-t border-gray-800 mt-6 sm:mt-8 pt-6 sm:pt-8 text-center">
            <p className="text-gray-400 text-xs sm:text-sm">
              Copyright © 2025, WE RUN PALESTINA
            </p>
          </div>
        </div>
      </footer> */}
    </div>
  );
}
