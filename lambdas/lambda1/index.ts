declare const process: {
  env: Record<string, string | undefined>;
};

type ApiGatewayEvent = {
  queryStringParameters?: Record<string, string | undefined> | null;
};

type ApiGatewayResponse = {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
};

type WeatherResponse = {
  city: string;
  country: string;
  temperature: number;
  feelsLike: number;
  description: string;
  humidity: number;
  windSpeed: number;
};

type OpenWeatherResponse = {
  name?: string;
  sys?: {
    country?: string;
  };
  main?: {
    temp?: number;
    feels_like?: number;
    humidity?: number;
  };
  weather?: Array<{
    description?: string;
  }>;
  wind?: {
    speed?: number;
  };
  message?: string;
};

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

function jsonResponse(statusCode: number, body: Record<string, unknown>): ApiGatewayResponse {
  return {
    statusCode,
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  };
}

function getCity(event: ApiGatewayEvent): string | null {
  const city = event.queryStringParameters?.city?.trim();
  return city ? city : null;
}

function mapWeatherData(data: OpenWeatherResponse): WeatherResponse {
  return {
    city: data.name ?? 'Unknown',
    country: data.sys?.country ?? 'Unknown',
    temperature: data.main?.temp ?? 0,
    feelsLike: data.main?.feels_like ?? 0,
    description: data.weather?.[0]?.description ?? 'No description available',
    humidity: data.main?.humidity ?? 0,
    windSpeed: data.wind?.speed ?? 0,
  };
}

export const handler = async (event: ApiGatewayEvent): Promise<ApiGatewayResponse> => {
  try {
    const city = getCity(event);
    if (!city) {
      return jsonResponse(400, {
        error: 'Missing required query parameter: city',
      });
    }

    const apiKey = process.env.OPENWEATHER_API_KEY?.trim();
    if (!apiKey) {
      console.error('Missing required environment variable: OPENWEATHER_API_KEY');
      return jsonResponse(500, {
        error: 'Weather service is not configured.',
      });
    }

    const url = new URL('https://api.openweathermap.org/data/2.5/weather');
    url.searchParams.set('q', city);
    url.searchParams.set('appid', apiKey);
    url.searchParams.set('units', 'metric');

    let response: Response;

    try {
      response = await fetch(url.toString());
    } catch (error) {
      console.error('Failed to reach OpenWeatherMap:', error);
      return jsonResponse(502, {
        error: 'Unable to reach the weather service. Please try again later.',
      });
    }

    let data: OpenWeatherResponse;

    try {
      data = (await response.json()) as OpenWeatherResponse;
    } catch (error) {
      console.error('Failed to parse OpenWeatherMap response:', error);
      return jsonResponse(502, {
        error: 'Received an invalid response from the weather service.',
      });
    }

    if (!response.ok) {
      const message = data.message ?? 'Weather lookup failed.';
      const statusCode = response.status === 404 ? 404 : 502;

      return jsonResponse(statusCode, {
        error: message,
      });
    }

    return jsonResponse(200, mapWeatherData(data));
  } catch (error) {
    console.error('Unexpected error in weather handler:', error);
    return jsonResponse(500, {
      error: 'An unexpected error occurred while fetching weather data.',
    });
  }
};
