'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';

export default function RegisterPage() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    stravaName: '',
    packageType: 'basic',
    donationAmount: '',
    jerseySize: '',
    gender: '',
    simpleAddress: '',
    fullAddress: {
      street: '',
      rtRw: '',
      district: '',
      city: '',
      province: '',
      postcode: ''
    }
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [paymentData, setPaymentData] = useState(null);
  const [redirectCountdown, setRedirectCountdown] = useState(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [showFullAddress, setShowFullAddress] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    if (name.startsWith('fullAddress.')) {
      const addressField = name.split('.')[1];
      setFormData(prev => ({
        ...prev,
        fullAddress: {
          ...prev.fullAddress,
          [addressField]: value
        }
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: value
      }));
    }
  };

  const handlePackageSelect = (packageType) => {
    setFormData(prev => ({
      ...prev,
      packageType: packageType,
      // Reset jersey size if switching to basic package
      jerseySize: packageType === 'basic' ? '' : prev.jerseySize,
      // Reset gender if switching to basic package (gender only needed for jersey packages)
      gender: packageType === 'basic' ? '' : prev.gender
    }));
    setIsDropdownOpen(false);
  };

  const getPackageOption = (type) => {
    if (type === 'basic') {
      return {
        value: 'basic',
        label: '💫 Basic - Rp. 100.000',
        description: 'Paket dasar tanpa jersey'
      };
    } else if (type === 'basic-jersey') {
      return {
        value: 'basic-jersey',
        label: '🌟 Basic + Jersey - Rp. 250.000',
        description: 'Paket dasar dengan jersey'
      };
    } else {
      return {
        value: 'jersey-only',
        label: '👕 Jersey Only - Rp. 150.000',
        description: 'Hanya jersey'
      };
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitStatus('');
    setErrorMessage('');

    try {
      const response = await fetch('/api/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const result = await response.json();

      if (response.ok) {
        setSubmitStatus('success');
        setPaymentData(result);
        setFormData({ 
          name: '', 
          email: '', 
          phone: '', 
          stravaName: '', 
          packageType: 'basic',
          donationAmount: '',
          jerseySize: '',
          gender: '',
          simpleAddress: '',
          fullAddress: {
            street: '',
            rtRw: '',
            district: '',
            city: '',
            province: '',
            postcode: ''
          }
        });
        
        // Auto-redirect to payment after 2 seconds
        setTimeout(() => {
          if (result.paymentLink) {
            window.open(result.paymentLink, '_blank');
          }
        }, 2000);
      } else {
        setSubmitStatus('error');
        setErrorMessage(result.error || 'Terjadi kesalahan. Silakan coba lagi.');
        console.error('Registration failed:', result.error);
      }
    } catch (error) {
      setSubmitStatus('error');
      setErrorMessage('Terjadi kesalahan jaringan. Silakan coba lagi.');
      console.error('Registration error:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Calculate package details
  const getPackageDetails = () => {
    if (formData.packageType === 'basic') {
      return {
        baseAmount: 100000,
        fixedDonation: 0,
        total: 100000,
        name: 'Basic'
      };
    } else if (formData.packageType === 'basic-jersey') {
      return {
        baseAmount: 250000,
        fixedDonation: 0,
        total: 250000,
        name: 'Basic + Jersey'
      };
    } else {
      return {
        baseAmount: 150000,
        fixedDonation: 0,
        total: 150000,
        name: 'Jersey Only'
      };
    }
  };

  const packageDetails = getPackageDetails();
  const additionalDonation = parseInt(formData.donationAmount) || 0;
  const totalAmount = packageDetails.total + additionalDonation;

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
            <div className="flex flex-col order-2 lg:order-1">
              {/* Hero Image */}
              <div className="relative flex items-center justify-center p-4 sm:p-6 lg:p-8">
                <Image 
                  src="/images/HeroImage.svg" 
                  alt="We Run Palestina Hero Image" 
                  width={500} 
                  height={500}
                  className="w-[80%] h-auto max-w-sm sm:max-w-md lg:max-w-lg rounded-lg"
                  priority
                />
              </div>
            </div>

            {/* Right Side - Registration Form */}
            <div className="bg-white p-4 sm:p-6 lg:p-8 order-1 lg:order-2">
              <div className="space-y-4 sm:space-y-6">
                <div className="text-center">
                  <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-3">
                    Daftar We Run Palestina
                  </h2>
                  <p className="text-gray-600 text-sm sm:text-base mb-4 leading-relaxed px-2">
                    We Run Palestina (WRP) hadir sebagai charity run untuk
                    menggelang donasi dan memastikan dunia tidak lupa.
                  </p>
                  {/* <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 sm:p-4 mb-4 sm:mb-6">
                    <p className="text-black font-semibold text-base sm:text-lg mb-2">
                      Paket {packageDetails.name}: Rp. {packageDetails.total.toLocaleString('id-ID')}
                    </p>
                    <div className="text-sm text-gray-600 space-y-1">
                      <p>• Biaya tetap: Rp. {packageDetails.baseAmount.toLocaleString('id-ID')}</p>
                      <p>• Donasi tetap untuk Palestina: Rp. {packageDetails.fixedDonation.toLocaleString('id-ID')}</p>
                    </div>
                    {additionalDonation > 0 && (
                      <div className="border-t border-gray-300 mt-2 pt-2">
                        <p className="text-green-600 font-medium text-sm">
                          + Donasi tambahan: Rp. {additionalDonation.toLocaleString('id-ID')}
                        </p>
                      </div>
                    )}
                    <div className="border-t border-gray-300 mt-2 pt-2">
                      <p className="text-black font-bold text-lg">
                        Total: Rp. {totalAmount.toLocaleString('id-ID')}
                      </p>
                    </div>
                  </div> */}
                </div>

                {submitStatus === 'success' && (
                  <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl text-sm sm:text-base">
                    <div className="font-semibold mb-2">Pendaftaran berhasil! 🎉</div>
                    <div className="mb-2">
                      ID Pendaftaran: <span className="font-mono">{paymentData?.registrationId}</span>
                    </div>
                    <div className="mb-2">
                      Paket: <span className="font-semibold">{paymentData?.packageType || 'Starter'}</span>
                    </div>
                    <div className="mb-2">
                      Biaya Tetap: <span className="font-semibold">Rp {(paymentData?.baseAmount || 80000).toLocaleString('id-ID')}</span>
                    </div>
                    <div className="mb-2">
                      Donasi Tetap: <span className="font-semibold">Rp {(paymentData?.fixedDonation || 20000).toLocaleString('id-ID')}</span>
                    </div>
                    {paymentData?.additionalDonation > 0 && (
                      <div className="mb-2">
                        Donasi Tambahan: <span className="font-semibold">Rp {(paymentData?.additionalDonation || 0).toLocaleString('id-ID')}</span>
                      </div>
                    )}
                    <div className="mb-3">
                      <span className="font-bold">Total: Rp {(paymentData?.totalAmount || 100000).toLocaleString('id-ID')}</span>
                    </div>
                    <div className="mb-3">
                      {paymentData?.data?.paymentInstructions}
                    </div>
                    {paymentData?.paymentLink && (
                      <div className="space-y-2">
                        <div className="text-xs text-green-600">
                          Anda akan diarahkan ke halaman pembayaran dalam 2 detik...
                        </div>
                        <button
                          onClick={() => {
                            window.open(paymentData.paymentLink, '_blank');
                            // Start countdown
                            setRedirectCountdown(6);
                            const countdownInterval = setInterval(() => {
                              setRedirectCountdown((prev) => {
                                if (prev <= 1) {
                                  clearInterval(countdownInterval);
                                  window.location.href = 'https://werunpalestina.framer.website';
                                  return 0;
                                }
                                return prev - 1;
                              });
                            }, 1000);
                          }}
                          className="w-full bg-green-600 text-white py-2 px-4 rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
                        >
                          Bayar Sekarang - Rp {(paymentData?.totalAmount || 100000).toLocaleString('id-ID')}
                        </button>
                        {redirectCountdown !== null && (
                          <div className="text-center text-xs text-green-600 mt-2">
                            Anda akan diarahkan kembali ke halaman utama dalam {redirectCountdown} detik...
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {submitStatus === 'error' && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm sm:text-base">
                    {errorMessage}
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700 px-4">
                      Pilih Paket
                    </label>
                    <div className="relative" ref={dropdownRef}>
                      {/* Custom Dropdown Button */}
                      <button
                        type="button"
                        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                        className="w-full px-4 sm:px-6 lg:px-8 py-1 sm:py-2 lg:py-4 text-base sm:text-lg lg:text-xl border-2 border-gray-200 rounded-full focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all duration-200 text-gray-900 bg-white cursor-pointer text-left flex items-center justify-between"
                      >
                        <span className="flex-1">
                          {getPackageOption(formData.packageType).label}
                        </span>
                        <svg 
                          className={`w-5 h-5 text-gray-400 transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`} 
                          fill="none" 
                          stroke="currentColor" 
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>

                      {/* Custom Dropdown Options */}
                      {isDropdownOpen && (
                        <div className="absolute z-10 w-full mt-2 bg-white border-2 border-gray-200 rounded-2xl shadow-lg overflow-hidden">
                          {/* Basic Option */}
                          <button
                            type="button"
                            onClick={() => handlePackageSelect('basic')}
                            className={`w-full px-4 sm:px-6 py-3 sm:py-4 text-left hover:bg-gray-50 transition-colors duration-200 border-b border-gray-100 last:border-b-0 ${
                              formData.packageType === 'basic' ? 'bg-green-50 border-green-200' : ''
                            }`}
                          >
                            <div className="flex items-center space-x-3">
                              <span className="text-2xl">💫</span>
                              <div className="flex-1">
                                <div className="font-semibold text-gray-900 text-base sm:text-lg">
                                  Basic - Rp. 100.000
                                </div>
                                <div className="text-sm text-gray-600">
                                  Paket dasar tanpa jersey
                                </div>
                              </div>
                              {formData.packageType === 'basic' && (
                                <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                              )}
                            </div>
                          </button>

                          {/* Basic + Jersey Option */}
                          <button
                            type="button"
                            onClick={() => handlePackageSelect('basic-jersey')}
                            className={`w-full px-4 sm:px-6 py-3 sm:py-4 text-left hover:bg-gray-50 transition-colors duration-200 border-b border-gray-100 last:border-b-0 ${
                              formData.packageType === 'basic-jersey' ? 'bg-green-50 border-green-200' : ''
                            }`}
                          >
                            <div className="flex items-center space-x-3">
                              <span className="text-2xl">🌟</span>
                              <div className="flex-1">
                                <div className="font-semibold text-gray-900 text-base sm:text-lg">
                                  Basic + Jersey - Rp. 250.000
                                </div>
                                <div className="text-sm text-gray-600">
                                  Paket dasar dengan jersey
                                </div>
                              </div>
                              {formData.packageType === 'basic-jersey' && (
                                <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                              )}
                            </div>
                          </button>

                          {/* Jersey Only Option */}
                          <button
                            type="button"
                            onClick={() => handlePackageSelect('jersey-only')}
                            className={`w-full px-4 sm:px-6 py-3 sm:py-4 text-left hover:bg-gray-50 transition-colors duration-200 ${
                              formData.packageType === 'jersey-only' ? 'bg-green-50 border-green-200' : ''
                            }`}
                          >
                            <div className="flex items-center space-x-3">
                              <span className="text-2xl">👕</span>
                              <div className="flex-1">
                                <div className="font-semibold text-gray-900 text-base sm:text-lg">
                                  Jersey Only - Rp. 150.000
                                </div>
                                <div className="text-sm text-gray-600">
                                  Hanya jersey
                                </div>
                              </div>
                              {formData.packageType === 'jersey-only' && (
                                <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                              )}
                            </div>
                          </button>
                        </div>
                      )}

                      {/* Hidden input for form submission */}
                      <input
                        type="hidden"
                        name="packageType"
                        value={formData.packageType}
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <input
                      type="text"
                      name="name"
                      placeholder="Nama"
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

                  {/* Address Section - Moved below email */}
                  <div className="space-y-3">
                    <label className="block text-sm font-medium text-gray-700 px-4">
                      Alamat
                    </label>
                    
                    {!showFullAddress ? (
                      <div className="space-y-2">
                        <input
                          type="text"
                          name="simpleAddress"
                          placeholder="Alamat lengkap"
                          value={formData.simpleAddress}
                          onChange={handleInputChange}
                          required
                          className="w-full px-4 sm:px-6 lg:px-8 py-1 sm:py-2 lg:py-4 text-base sm:text-lg lg:text-xl border-2 border-gray-200 rounded-full focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all duration-200 text-gray-900 placeholder-gray-500"
                        />
                        <button
                          type="button"
                          onClick={() => setShowFullAddress(true)}
                          className="text-sm text-green-600 hover:text-green-700 font-medium px-4 transition-colors duration-200"
                        >
                          + Masukkan alamat lengkap dengan detail
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-3 bg-gray-50 border border-gray-200 rounded-2xl p-4">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-sm font-medium text-gray-700">Alamat Lengkap</span>
                          <button
                            type="button"
                            onClick={() => setShowFullAddress(false)}
                            className="text-sm text-gray-500 hover:text-gray-700 transition-colors duration-200"
                          >
                            Gunakan alamat sederhana
                          </button>
                        </div>
                        
                        <div className="grid grid-cols-1 gap-3">
                          <input
                            type="text"
                            name="fullAddress.street"
                            placeholder="Alamat jalan / nama jalan"
                            value={formData.fullAddress.street}
                            onChange={handleInputChange}
                            required={showFullAddress}
                            className="w-full px-4 py-3 text-base border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all duration-200 text-gray-900 placeholder-gray-500"
                          />
                          
                          <div className="grid grid-cols-2 gap-3">
                            <input
                              type="text"
                              name="fullAddress.rtRw"
                              placeholder="RT/RW"
                              value={formData.fullAddress.rtRw}
                              onChange={handleInputChange}
                              className="w-full px-4 py-3 text-base border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all duration-200 text-gray-900 placeholder-gray-500"
                            />
                            <input
                              type="text"
                              name="fullAddress.district"
                              placeholder="Kelurahan/Desa"
                              value={formData.fullAddress.district}
                              onChange={handleInputChange}
                              required={showFullAddress}
                              className="w-full px-4 py-3 text-base border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all duration-200 text-gray-900 placeholder-gray-500"
                            />
                          </div>
                          
                          <div className="grid grid-cols-2 gap-3">
                            <input
                              type="text"
                              name="fullAddress.city"
                              placeholder="Kota/Kabupaten"
                              value={formData.fullAddress.city}
                              onChange={handleInputChange}
                              required={showFullAddress}
                              className="w-full px-4 py-3 text-base border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all duration-200 text-gray-900 placeholder-gray-500"
                            />
                            <input
                              type="text"
                              name="fullAddress.province"
                              placeholder="Provinsi"
                              value={formData.fullAddress.province}
                              onChange={handleInputChange}
                              required={showFullAddress}
                              className="w-full px-4 py-3 text-base border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all duration-200 text-gray-900 placeholder-gray-500"
                            />
                          </div>
                          
                          <input
                            type="text"
                            name="fullAddress.postcode"
                            placeholder="Kode pos"
                            value={formData.fullAddress.postcode}
                            onChange={handleInputChange}
                            required={showFullAddress}
                            className="w-full px-4 py-3 text-base border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all duration-200 text-gray-900 placeholder-gray-500"
                          />
                        </div>
                      </div>
                    )}
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
                      type="text"
                      name="stravaName"
                      placeholder="Nama di Strava"
                      value={formData.stravaName}
                      onChange={handleInputChange}
                      required
                      className="w-full px-4 sm:px-6 lg:px-8 py-1 sm:py-2 lg:py-4 text-base sm:text-lg lg:text-xl border-2 border-gray-200 rounded-full focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all duration-200 text-gray-900 placeholder-gray-500"
                    />
                  </div>

                  <div className="space-y-2">
                    <input
                      type="number"
                      name="donationAmount"
                      placeholder="Donasi Tambahan (Opsional)"
                      value={formData.donationAmount}
                      onChange={handleInputChange}
                      min="0"
                      className="w-full px-4 sm:px-6 lg:px-8 py-1 sm:py-2 lg:py-4 text-base sm:text-lg lg:text-xl border-2 border-gray-200 rounded-full focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all duration-200 text-gray-900 placeholder-gray-500"
                    />
                    <p className="text-xs text-gray-500 px-4">
                      Masukkan jumlah donasi tambahan untuk mendukung Palestina (dalam Rupiah)
                    </p>
                  </div>

                  {/* Gender Field - Only show for packages with jersey */}
                  {(formData.packageType === 'basic-jersey' || formData.packageType === 'jersey-only') && (
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700 px-4">
                        Jenis Kelamin
                      </label>
                      <div className="grid grid-cols-2 gap-3 px-4">
                        <label className={`relative flex items-center justify-center p-3 border-2 rounded-lg cursor-pointer transition-all duration-200 hover:border-green-400 ${
                          formData.gender === 'Laki-laki'
                            ? 'border-green-500 bg-green-50 text-green-700'
                            : 'border-gray-200 hover:bg-gray-50'
                        }`}>
                          <input
                            type="radio"
                            name="gender"
                            value="Laki-laki"
                            checked={formData.gender === 'Laki-laki'}
                            onChange={handleInputChange}
                            required
                            className="sr-only"
                          />
                          <span className="font-medium text-sm sm:text-base">
                            Laki-laki
                          </span>
                          {formData.gender === 'Laki-laki' && (
                            <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
                              <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                            </div>
                          )}
                        </label>
                        
                        <label className={`relative flex items-center justify-center p-3 border-2 rounded-lg cursor-pointer transition-all duration-200 hover:border-green-400 ${
                          formData.gender === 'Perempuan'
                            ? 'border-green-500 bg-green-50 text-green-700'
                            : 'border-gray-200 hover:bg-gray-50'
                        }`}>
                          <input
                            type="radio"
                            name="gender"
                            value="Perempuan"
                            checked={formData.gender === 'Perempuan'}
                            onChange={handleInputChange}
                            required
                            className="sr-only"
                          />
                          <span className="font-medium text-sm sm:text-base">
                            Perempuan
                          </span>
                          {formData.gender === 'Perempuan' && (
                            <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
                              <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                            </div>
                          )}
                        </label>
                      </div>
                    </div>
                  )}

                  {/* Jersey Size Field - Only show for packages with jersey */}
                  {(formData.packageType === 'basic-jersey' || formData.packageType === 'jersey-only') && (
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700 px-4">
                        Ukuran Jersey
                      </label>
                      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-2 px-4">
                        {['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'].map((size) => (
                          <label
                            key={size}
                            className={`relative flex items-center justify-center p-3 border-2 rounded-lg cursor-pointer transition-all duration-200 hover:border-green-400 ${
                              formData.jerseySize === size
                                ? 'border-green-500 bg-green-50 text-green-700'
                                : 'border-gray-200 hover:bg-gray-50'
                            }`}
                          >
                            <input
                              type="radio"
                              name="jerseySize"
                              value={size}
                              checked={formData.jerseySize === size}
                              onChange={handleInputChange}
                              required
                              className="sr-only"
                            />
                            <span className="font-medium text-sm sm:text-base">
                              {size}
                            </span>
                            {formData.jerseySize === size && (
                              <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
                                <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                              </div>
                            )}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

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
                          Mendaftar...
                        </span>
                      ) : (
                        'Daftar Sekarang'
                      )}
                    </button>
                  </div>
                  
                  <div className="text-center pt-4">
                    <p className="text-xs sm:text-sm text-gray-500 px-2">
                      Dengan mendaftar, Anda menyetujui{' '}
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
