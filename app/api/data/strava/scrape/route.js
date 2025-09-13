import { NextResponse } from 'next/server'
import { load } from 'cheerio'

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const url = searchParams.get('url') || 'https://www.strava.com/activities/15790929996'
    if (!/^https?:\/\/www\.strava\.com\/activities\/[0-9]+/.test(url)) {
      return NextResponse.json({ error: 'invalid strava activity url' }, { status: 400 })
    }

    // allow passing Strava cookies for authenticated fetch: headers or query params
    const cookieToken = request.headers.get('x-strava-remember-token') || searchParams.get('strava_remember_token')
    const cookieId = request.headers.get('x-strava-remember-id') || searchParams.get('strava_remember_id')
    const cookieHeader = cookieToken && cookieId ? `strava_remember_token=${cookieToken}; strava_remember_id=${cookieId}` : null

    // fallback to environment-configured Strava session cookies (server-side consts)
    // Set STRAVA_REMEMBER_TOKEN and STRAVA_REMEMBER_ID in your environment to enable automatic authenticated fetches.
    const envCookieToken = process.env.STRAVA_REMEMBER_TOKEN || "eyJzaWduaW5nX2tleSI6InYxIiwiZW5jcnlwdGlvbl9rZXkiOiJ2MSIsIml2IjoidHdnZFowb1M2YXVHS1VFQ21RaDRrZz09XG4iLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJjb20uc3RyYXZhLmF0aGxldGVzIiwic3ViIjozNjkyMzY2MSwiaWF0IjoxNzU2NzE4Mzk2LCJleHAiOjE3NTkzMTAzOTYsImVtYWlsIjoiMU42OUpHWmpBTGo1K3FRRkV6TkVsZTZsWjV0WjNtZm9peEpBSXU2WkE0NGIycXY3UFZPUEE2ZFlKcG9NXG41R0NCK2FBTjhOSzNCeGIxQkoycklabkdlZz09XG4ifQ.GctTqu6w6wx_iUkZ75PFtBc3UvvSD3eOFnoURJTjbfQ"
    const envCookieId = process.env.STRAVA_REMEMBER_ID || "36923661"
    const envCookieHeader = envCookieToken && envCookieId ? `strava_remember_token=${envCookieToken}; strava_remember_id=${envCookieId}` : null

    // choose the cookie header we will actually send (prefer request-provided, then env)
    const useCookieHeader = cookieHeader || envCookieHeader

    if (useCookieHeader) {
      // warning: forwarding or storing cookies exposes credentials. Use env cookies only in trusted server environments.
    }

    const fetchHeaders = {
      'User-Agent': 'Mozilla/5.0 (compatible; vrun-bot/1.0)',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      ...(useCookieHeader ? { Cookie: useCookieHeader, Referer: 'https://www.strava.com/' } : {}),
    }

    const resp = await fetch(url, { headers: fetchHeaders })
    if (!resp.ok) return NextResponse.json({ error: 'fetch failed', status: resp.status }, { status: 502 })
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
    $('ul.inline-stats.section li').each((i, li) => {
      const label = $(li).find('.label').text().trim().toLowerCase()
      const strong = $(li).find('strong').first().text().trim()
      if (label.includes('distance')) stats.distance = strong
      else if (label.includes('moving time') || label.includes('moving')) stats.moving_time = strong
      else if (label.includes('pace')) stats.pace = strong
      else {
        // fallback: assign to generic keys like stat0, stat1
        stats[`stat${i}`] = strong
      }
    })

    // If distance/moving_time/pace not present, try to extract from concatenated activity text
    const activityText = $('ul.inline-stats.section').text().replace(/\s+/g, ' ').trim()
    if (!stats.distance) {
      const distMatch = activityText.match(/([0-9]+\.?[0-9]*)\s*(km|mi)/i)
      if (distMatch) stats.distance = `${distMatch[1]} ${distMatch[2]}`
    }
    if (!stats.moving_time) {
      const timeMatch = activityText.match(/(\d{1,2}:\d{2}:\d{2})/)
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
