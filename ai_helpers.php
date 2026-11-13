<?php
/**
 * Syrian Home Supermarket - AI Content & Description Generator
 * Powered by Google Gemini 2.5 Flash API
 */

if (!function_exists('getGeminiApiKey')) {
    function getGeminiApiKey(): string {
        global $settings;
        $key = trim((string)($settings['gemini_api_key'] ?? ''));
        if ($key !== '') return $key;
        if (defined('GEMINI_API_KEY') && constant('GEMINI_API_KEY')) {
            return (string)constant('GEMINI_API_KEY');
        }
        return getenv('GEMINI_API_KEY') ?: '';
    }
}

if (!function_exists('generateAiProductDescription')) {
    /**
     * Generate an authentic, marketing-rich Arabic product description using Gemini API for a single product.
     *
     * @param string $productName
     * @param string $category
     * @param string $subCategory
     * @param float $price
     * @param bool $isWeightBased
     * @return array ['success' => bool, 'description' => string, 'error' => ?string]
     */
    function generateAiProductDescription(
        string $productName, 
        string $category = '', 
        string $subCategory = '', 
        float $price = 0.0, 
        bool $isWeightBased = false
    ): array {
        $name = trim($productName);
        if ($name === '') {
            return ['success' => false, 'description' => '', 'error' => 'اسم المنتج مطلوب لتوليد الوصف'];
        }

        $apiKey = getGeminiApiKey();
        if (empty($apiKey)) {
            return ['success' => false, 'description' => '', 'error' => 'مفتاح Gemini API غير مضبوط'];
        }

        $catText = trim($category . ($subCategory !== '' ? ' / ' . $subCategory : ''));
        if ($catText === '') $catText = 'أغذية ومنتجات شامية عامة';
        $unitText = $isWeightBased ? 'يباع بالوزن (بالكيلو/الغرام)' : 'يباع بالقطعة/العبوة';

        $prompt = "أنت خبير تسويق محتوى ومسؤول متجر إلكتروني لسوبر ماركت \"المنزل السوري\" (Syrian Home Supermarket) المتخصص في الأغذية والمنتجات السورية والشامية الأصيلة.
المطلوب: كتابة وصف تسويقي احترافي وجذاب للمنتج التالي ليظهر في صفحة تفاصيل المنتج بالمتجر الإلكتروني.

اسم المنتج: {$name}
القسم: {$catText}
نوع البيع: {$unitText}

الشروط والضوابط الصارمة:
1. اكتب فقرة تسويقية متناسقة وشهية وجذابة (بين 30 إلى 50 كلمة).
2. أبرز جودة المنتج، ومذاقه الأصيل أو فائدته، وطريقة استخدامه المناسبة لمائدة الطعام اليومية أو الضيافة الشامية الفاخرة.
3. استخدم أسلوباً عربياً راقياً ودافئاً يعبر عن كرم وأصالة البيت السوري والمذاق الشامي الأصيل.
4. ممنوع وضع علامات تنصيص وممنوع وضع مقدمات مثل 'إليك الوصف' وممنوع وضع عناوين أو نقاط أو وسوم (هاشتاج). اكتب نص الوصف مباشرة كنص نقي.";

        $url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' . urlencode($apiKey);

        $payload = [
            'contents' => [
                [
                    'parts' => [
                        ['text' => $prompt]
                    ]
                ]
            ],
            'generationConfig' => [
                'temperature' => 0.7,
                'maxOutputTokens' => 300,
            ]
        ];

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_UNICODE),
            CURLOPT_HTTPHEADER => ['Content-Type: application/json; charset=utf-8'],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 20,
            CURLOPT_SSL_VERIFYPEER => true,
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlErr = curl_error($ch);
        curl_close($ch);

        if ($curlErr) {
            return ['success' => false, 'description' => '', 'error' => 'فشل الاتصال بـ Gemini API: ' . $curlErr];
        }

        if ($httpCode !== 200 || !$response) {
            return ['success' => false, 'description' => '', 'error' => "خطأ من خادم Gemini (رمز {$httpCode})"];
        }

        $data = json_decode($response, true);
        $text = $data['candidates'][0]['content']['parts'][0]['text'] ?? '';
        $text = trim($text);
        $text = trim($text, "\"'«»\n\r ");

        if ($text === '') {
            return ['success' => false, 'description' => '', 'error' => 'لم يتم إرجاع نص وصف من النموذج'];
        }

        return [
            'success' => true,
            'description' => $text,
            'error' => null
        ];
    }
}

if (!function_exists('generateAiProductDescriptionBatch')) {
    /**
     * Batch generate product descriptions using Gemini JSON output mode (up to 10 items at once).
     *
     * @param array $items Array of ['id' => int, 'name' => string, 'category' => string]
     * @return array ['success' => bool, 'results' => array, 'error' => ?string]
     */
    function generateAiProductDescriptionBatch(array $items): array {
        if (empty($items)) {
            return ['success' => true, 'results' => [], 'error' => null];
        }

        $apiKey = getGeminiApiKey();
        if (empty($apiKey)) {
            return ['success' => false, 'results' => [], 'error' => 'مفتاح Gemini API غير مضبوط'];
        }

        $minimalList = [];
        foreach ($items as $it) {
            $minimalList[] = [
                'id' => (int)$it['id'],
                'name' => trim((string)$it['name']),
                'category' => trim((string)($it['category'] ?? 'أغذية شامية'))
            ];
        }

        $itemsJson = json_encode($minimalList, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);

        $prompt = "أنت خبير تسويق محتوى ومسؤول متجر إلكتروني لسوبر ماركت \"المنزل السوري\" (Syrian Home Supermarket).
اكتب وصفاً تسويقياً جذاباً ومختصراً (بين 30 إلى 50 كلمة) لكل منتج من المنتجات التالية ليظهر في المتجر الإلكتروني.
الأسلوب: عربي راقٍ يعبر عن جودة المنتج وأصالة المذاق الشامي، مناسب لمائدة الطعام أو الضيافة.

المنتجات:
{$itemsJson}

المطلوب: أرجع النتيجة حصراً بصيغة JSON صالحة كقائمة كائنات بنفس المعرفات (IDs):
[
  {\"id\": 1, \"description\": \"نص الوصف هنا...\"}
]
ممنوع كتابة أي نصوص خارج مصفوفة الـ JSON.";

        $url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' . urlencode($apiKey);

        $payload = [
            'contents' => [
                [
                    'parts' => [
                        ['text' => $prompt]
                    ]
                ]
            ],
            'generationConfig' => [
                'responseMimeType' => 'application/json',
                'temperature' => 0.7,
                'maxOutputTokens' => 1500,
            ]
        ];

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_UNICODE),
            CURLOPT_HTTPHEADER => ['Content-Type: application/json; charset=utf-8'],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 30,
            CURLOPT_SSL_VERIFYPEER => true,
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlErr = curl_error($ch);
        curl_close($ch);

        if ($curlErr) {
            return ['success' => false, 'results' => [], 'error' => 'فشل الاتصال بـ Gemini API: ' . $curlErr];
        }

        if ($httpCode !== 200 || !$response) {
            return ['success' => false, 'results' => [], 'error' => "خطأ من خادم Gemini (رمز {$httpCode})"];
        }

        $data = json_decode($response, true);
        $rawText = $data['candidates'][0]['content']['parts'][0]['text'] ?? '';
        $parsed = json_decode($rawText, true);

        if (!is_array($parsed)) {
            return ['success' => false, 'results' => [], 'error' => 'تعذر تحليل استجابة JSON من النموذج'];
        }

        $resultsMap = [];
        foreach ($parsed as $pItem) {
            $pid = (int)($pItem['id'] ?? 0);
            $desc = trim((string)($pItem['description'] ?? ''));
            if ($pid > 0 && $desc !== '') {
                $resultsMap[$pid] = $desc;
            }
        }

        return [
            'success' => true,
            'results' => $resultsMap,
            'error' => null
        ];
    }
}
