import { NextResponse } from 'next/server'
import { load } from 'cheerio'

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const originalUrl = searchParams.get('url') || 'https://www.strava.com/activities/15790929996'
    if (!/^https?:\/\/(www\.strava\.com\/activities\/[0-9]+(?:\/overview)?|strava\.app\.link\/[A-Za-z0-9]+)$/.test(originalUrl)) {
      return NextResponse.json({ error: 'invalid strava activity url or short link' }, { status: 400 })
    }

    let finalUrl = originalUrl

    // If it's a short link, follow the redirect to get the actual activity URL
    if (originalUrl.includes('strava.app.link')) {
      try {
        const redirectResp = await fetch(originalUrl, { redirect: 'follow' })
        finalUrl = redirectResp.url
        // Small delay after redirect
        await new Promise(resolve => setTimeout(resolve, 1000))
      } catch (e) {
        return NextResponse.json({ error: 'failed to resolve short link', details: e.message }, { status: 400 })
      }
    }

    // Extract activity ID from the final URL
    const activityIdMatch = finalUrl.match(/\/activities\/([0-9]+)/)
    if (!activityIdMatch) {
      return NextResponse.json({ error: 'could not extract activity ID from resolved URL' }, { status: 400 })
    }
    const activityId = activityIdMatch[1]
    const url = `https://www.strava.com/activities/${activityId}/overview`
    console.log("DATA FETCHED: ", url)

    // allow passing Strava cookies for authenticated fetch: headers or query params
    const cookieToken = request.headers.get('x-strava-remember-token') || searchParams.get('strava_remember_token')
    const cookieId = request.headers.get('x-strava-remember-id') || searchParams.get('strava_remember_id')
    const cookieHeader = cookieToken && cookieId ? `strava_remember_token=${cookieToken}; strava_remember_id=${cookieId}` : null

    // fallback to environment-configured Strava session cookies (server-side consts)
    // Set STRAVA_REMEMBER_TOKEN and STRAVA_REMEMBER_ID in your environment to enable automatic authenticated fetches.
    const envCookieToken = process.env.STRAVA_REMEMBER_TOKEN // Remove hardcoded value - use environment variable
    const envCookieId = process.env.STRAVA_REMEMBER_ID // Remove hardcoded value - use environment variable
    const envCookieHeader = envCookieToken && envCookieId ? `strava_remember_token=${envCookieToken}; strava_remember_id=${envCookieId}` : null

    // choose the cookie header we will actually send (prefer request-provided, then env)
    const useCookieHeader = cookieHeader || envCookieHeader

    if (useCookieHeader) {
      // warning: forwarding or storing cookies exposes credentials. Use env cookies only in trusted server environments.
    }

    const fetchHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Cache-Control': 'max-age=0',
      ...(useCookieHeader ? { Cookie: useCookieHeader, Referer: 'https://www.strava.com/' } : {}),
    }

    const resp = await fetch(url, { headers: fetchHeaders })
    if (!resp.ok) {
      if (resp.status === 403) {
        return NextResponse.json({
          error: 'access forbidden - Strava may require authentication or cookies may be expired',
          status: resp.status,
          suggestion: 'Try providing valid strava_remember_token and strava_remember_id via headers or query params'
        }, { status: 502 })
      }
      return NextResponse.json({ error: 'fetch failed', status: resp.status }, { status: 502 })
    }

  // Wait 4 seconds to allow JavaScript content to load on the overview page
  await new Promise(resolve => setTimeout(resolve, 4000))

  const html = await resp.text()
  const $ = load(html)

    // extract pieces
  const detailsEl = $('div.details')
    const detailsText = detailsEl.text().replace(/\s+/g, ' ').trim()
    const activityName = detailsEl.find('h1.activity-name, h1.text-title1.activity-name, h1.text-title1').first().text().trim() || null
    const description = detailsEl.find('.activity-description-js .content').text().replace(/\s+/g, ' ').trim() || null
    const location = detailsEl.find('span.location').text().trim() || null
    const dateText = detailsEl.find('time').text().trim() || null

    // parse stats list items individually for robustness
    const stats = {}
    const foundLabels = [] // for debugging
    $('ul.inline-stats.section li').each((i, li) => {
      const label = $(li).find('.label').text().trim().toLowerCase()
      const strong = $(li).find('strong').first().text().trim()
      foundLabels.push(`${label}: ${strong}`) // for debugging

      if (label.includes('distance')) stats.distance = strong
      else if (label.includes('moving time') || label.includes('moving') || label.includes('time') || label.includes('duration')) stats.moving_time = strong
      else if (label.includes('pace') || label.includes('avg pace') || label.includes('average pace')) stats.pace = strong
      else {
        // fallback: assign to generic keys like stat0, stat1
        stats[`stat${i}`] = strong
      }
    })

    console.log('Found labels:', foundLabels) // Debug: show what labels were found

    // If distance/moving_time/pace not present, try to extract from concatenated activity text
    const activityText = $('ul.inline-stats.section').text().replace(/\s+/g, ' ').trim()
    if (!stats.distance) {
      const distMatch = activityText.match(/([0-9]+\.?[0-9]*)\s*(km|mi)/i)
      if (distMatch) stats.distance = `${distMatch[1]} ${distMatch[2]}`
    }
    if (!stats.moving_time) {
      const timeMatch = activityText.match(/(\d{1,2}:\d{2}:\d{2}|\d{1,2}:\d{2})/)
      if (timeMatch) stats.moving_time = timeMatch[0]
    }
    if (!stats.pace) {
      const paceMatch = activityText.match(/(\d{1,2}:\d{2})\s*(?:\/km|per km|km)?/i)
      if (paceMatch) stats.pace = paceMatch[0]
    }

    // Robust fallback: detect pace in various formats across li text, details, or full html
    if (!stats.pace) {
      const pacePatterns = [
        /(\d{1,2}:\d{2})\s*(?:\/\s?km|\/km|per km|km|\/\s?mi|\/mi|per mi|mi)?/i,
        /(\d{1,2})'\s?(\d{2})(?:"?)\s*(?:\/\s?km|\/km|per km|km|\/\s?mi|\/mi|per mi|mi)?/i
      ]

      const tryMatch = (text) => {
        for (const re of pacePatterns) {
          const m = text.match(re)
          if (m) {
            if (m[1] && m[2]) {
              // matched 6'57" style
              return `${m[1]}:${m[2]} /km`
            }
            if (m[1]) {
              return `${m[1]} /km`
            }
          }
        }
        return null
      }

      // check each li text
      $('ul.inline-stats.section li').each((i, li) => {
        if (!stats.pace) {
          const text = $(li).text().replace(/\s+/g, ' ').trim()
          const found = tryMatch(text)
          if (found) stats.pace = found
        }
      })

      // check details and body as last resort
      if (!stats.pace) {
        const hay = (detailsEl.text() + ' ' + $('body').text()).replace(/\s+/g, ' ')
        const found = tryMatch(hay)
        if (found) stats.pace = found
      }
    }

    // Robust fallback: detect moving_time in various formats across li text, details, or full html
    if (!stats.moving_time) {
      const timePatterns = [
        /(\d{1,2}:\d{2}:\d{2})/,  // HH:MM:SS
        /(\d{1,2}:\d{2})/,        // MM:SS
        /(\d+)\s*h\s*(\d+)\s*m/,  // Xh Ym
        /(\d+)\s*m\s*(\d+)\s*s/,  // Xm Ys
      ]

      const tryTimeMatch = (text) => {
        for (const re of timePatterns) {
          const m = text.match(re)
          if (m) {
            if (m[1] && m[2] && m[3]) {
              // Xm Ys format
              return `${m[1]}:${m[2]}:${m[3]}`
            }
            if (m[1] && m[2]) {
              // Xh Ym format
              return `${m[1]}:${m[2]}:00`
            }
            if (m[1]) {
              return m[1]
            }
          }
        }
        return null
      }

      // check each li text
      $('ul.inline-stats.section li').each((i, li) => {
        if (!stats.moving_time) {
          const text = $(li).text().replace(/\s+/g, ' ').trim()
          const found = tryTimeMatch(text)
          if (found) stats.moving_time = found
        }
      })

      // check details and body as last resort
      if (!stats.moving_time) {
        const hay = (detailsEl.text() + ' ' + $('body').text()).replace(/\s+/g, ' ')
        const found = tryTimeMatch(hay)
        if (found) stats.moving_time = found
      }
    }

    // diagnostics to help understand why selectors may be empty
    const diagnostics = {
      detailsFound: detailsEl.length > 0,
      statsFound: $('ul.inline-stats.section').length > 0,
      bodyLength: html.length,
    }

    // fallback: try meta tags (og) and ld+json scripts
    let ogTitle = $('meta[property="og:title"]').attr('content') || $('meta[name="twitter:title"]').attr('content') || null
    let ogDesc = $('meta[property="og:description"]').attr('content') || $('meta[name="description"]').attr('content') || null
    let ldjson = null
    $('script[type="application/ld+json"]').each((i, s) => {
      try {
        const parsed = JSON.parse($(s).html())
        if (!ldjson) ldjson = parsed
      } catch (e) {
        // ignore parse errors
      }
    })

    // compute whether provided cookies actually yielded authenticated content
  const auth_valid = !!useCookieHeader && (diagnostics.detailsFound && diagnostics.statsFound || Boolean(ldjson))

    // build final extracted object using fallbacks
    const extracted = {
      location: location || (ldjson && (ldjson.location || ldjson.address)) || null,
      date: dateText || (ldjson && ldjson.startDate) || null,
      activity_name: activityName || ogTitle || (ldjson && ldjson.name) || null,
      description: description || ogDesc || (ldjson && ldjson.description) || null,
      distance: stats.distance || null,
      moving_time: stats.moving_time || null,
      pace: stats.pace || null,
  authenticated: !!useCookieHeader,
      auth_valid,
    }

    // If key fields are still missing, include guidance in the response
    const issues = []
    if (!diagnostics.detailsFound) issues.push('details element not found - page may require login or be client-side rendered')
    if (!diagnostics.statsFound) issues.push('stats element not found - page may be rendered by JS')
    // If cookies were supplied but didn't produce authenticated content, surface a clear issue
    if (cookieHeader && !auth_valid) {
      issues.push('provided Strava cookies appear invalid or expired; refresh strava_remember_token and strava_remember_id or use OAuth access token')
    }

    return NextResponse.json({ raw: { detailsText, activityText }, extracted, diagnostics, ldjsonSample: ldjson ? ldjson : null, issues })
  } catch (e) {
    return NextResponse.json({ error: e.message, stack: e.stack }, { status: 500 })
  }
}
