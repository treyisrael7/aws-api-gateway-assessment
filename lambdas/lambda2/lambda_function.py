import json
import logging
import urllib.error
import urllib.parse
import urllib.request

logger = logging.getLogger()
logger.setLevel(logging.INFO)

JSON_HEADERS = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
}

REST_COUNTRIES_BASE_URL = 'https://restcountries.com/v3.1/name/'


def json_response(status_code, body):
    return {
        'statusCode': status_code,
        'headers': JSON_HEADERS,
        'body': json.dumps(body),
    }


def get_country_name(event):
    query_params = event.get('queryStringParameters') or {}
    name = query_params.get('name', '').strip()
    return name if name else None


def format_currencies(currencies):
    if not currencies:
        return []

    formatted = []
    for code, details in currencies.items():
        currency_name = details.get('name', code)
        symbol = details.get('symbol')
        if symbol:
            formatted.append(f'{currency_name} ({symbol})')
        else:
            formatted.append(currency_name)

    return formatted


def format_languages(languages):
    if not languages:
        return []

    return list(languages.values())


def map_country_data(country):
    capital = country.get('capital') or []
    flags = country.get('flags') or {}

    return {
        'name': country.get('name', {}).get('common', 'Unknown'),
        'officialName': country.get('name', {}).get('official', 'Unknown'),
        'capital': capital[0] if capital else None,
        'region': country.get('region', 'Unknown'),
        'population': country.get('population', 0),
        'currencies': format_currencies(country.get('currencies')),
        'languages': format_languages(country.get('languages')),
        'flag': flags.get('png') or flags.get('svg'),
    }


def fetch_country_data(name):
    encoded_name = urllib.parse.quote(name)
    url = f'{REST_COUNTRIES_BASE_URL}{encoded_name}'

    request = urllib.request.Request(
        url,
        headers={
            'Accept': 'application/json',
            'User-Agent': 'scansource-api-assessment/1.0',
        },
        method='GET',
    )

    with urllib.request.urlopen(request, timeout=10) as response:
        response_body = response.read().decode('utf-8')
        return response.getcode(), json.loads(response_body)


def lambda_handler(event, context):
    try:
        name = get_country_name(event)
        if not name:
            return json_response(400, {
                'error': 'Missing required query parameter: name',
            })

        try:
            status_code, data = fetch_country_data(name)
        except urllib.error.HTTPError as error:
            if error.code == 404:
                return json_response(404, {
                    'error': 'Country not found.',
                })

            logger.error('REST Countries API returned HTTP error: %s', error)
            return json_response(502, {
                'error': 'Unable to retrieve country information.',
            })
        except urllib.error.URLError as error:
            logger.error('Failed to reach REST Countries API: %s', error)
            return json_response(502, {
                'error': 'Unable to reach the country information service. Please try again later.',
            })
        except json.JSONDecodeError as error:
            logger.error('Failed to parse REST Countries API response: %s', error)
            return json_response(502, {
                'error': 'Received an invalid response from the country information service.',
            })

        if status_code != 200:
            return json_response(502, {
                'error': 'Unable to retrieve country information.',
            })

        if not isinstance(data, list) or not data:
            return json_response(404, {
                'error': 'Country not found.',
            })

        return json_response(200, map_country_data(data[0]))

    except Exception as error:
        logger.exception('Unexpected error in country handler: %s', error)
        return json_response(500, {
            'error': 'An unexpected error occurred while fetching country data.',
        })
