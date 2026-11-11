<?php
header('Content-Type: application/json');
require_once 'config.php';
require_once __DIR__ . '/storefront_helpers.php';

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['message'])) {
    $user_msg = trim($_POST['message']);
    $api_key = $settings['groq_api_key'] ?? '';

    if (empty($api_key) || ($settings['ai_chat_enabled'] ?? '1') !== '1') {
        echo json_encode(['reply' => 'عذراً، المساعد الذكي غير متاح حالياً.']);
        exit;
    }

    $store_name = $settings['store_name'] ?? 'المتجر الإلكتروني';
    $store_desc = $settings['store_description'] ?? '';
    $currency = $settings['store_currency'] ?? 'ج.م';
    
    // جلب عينة من الأقسام والمنتجات المتاحة لتمكين المساعد من الإجابة بدقة عن المتجر
    $cats = [];
    try {
        $cats = $pdo->query("SELECT name FROM categories LIMIT 10")->fetchAll(PDO::FETCH_COLUMN);
    } catch(Exception $e){}
    
    $prods = [];
    try {
        $prods = $pdo->query("SELECT name, price, category FROM products WHERE " . storefrontVisibleProductSql() . " ORDER BY id DESC LIMIT 10")->fetchAll(PDO::FETCH_ASSOC);
    } catch(Exception $e){}
    
    $prod_summary = "";
    foreach($prods as $p) {
        $prod_summary .= "- " . $p['name'] . " (القسم: " . $p['category'] . " - السعر: " . $p['price'] . " " . $currency . ")\n";
    }

    $system_prompt = "أنت المساعد الذكي وخدمة العملاء لمتجر '{$store_name}'.\n";
    if (!empty($store_desc)) {
        $system_prompt .= "نبذة عن المتجر: {$store_desc}\n";
    }
    if (!empty($cats)) {
        $system_prompt .= "الأقسام المتاحة: " . implode('، ', $cats) . "\n";
    }
    if (!empty($prod_summary)) {
        $system_prompt .= "عينة من أحدث المنتجات المتوفرة:\n" . $prod_summary;
    }
    $system_prompt .= "سياسة الشحن: " . ($settings['policy_shipping'] ?? '') . "\n";
    $system_prompt .= "سياسة الاسترجاع: " . ($settings['policy_return'] ?? '') . "\n";
    $system_prompt .= "رقم التواصل: " . ($settings['contact_phone'] ?? '') . "\n";
    $system_prompt .= "البريد الإلكتروني: " . ($settings['contact_email'] ?? '') . "\n";
    $system_prompt .= "تعليمات: تحدث بلهجة عربية ودودة ومهنية وراقية ومختصرة ومفيدة. ساعد العميل في العثور على ما يناسبه وأجب عن استفسارات الشحن والتوصيل والأسعار بدقة.\n";

    $post_data = json_encode([
        'model' => 'llama-3.1-8b-instant',
        'messages' => [
            ['role' => 'system', 'content' => $system_prompt],
            ['role' => 'user', 'content' => $user_msg]
        ],
        'max_tokens' => 300
    ]);

    $response = false;
    $has_error = false;

    if (function_exists('curl_init')) {
        $ch = curl_init('https://api.groq.com/openai/v1/chat/completions');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_TIMEOUT => 12,
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_HTTPHEADER => [
                "Authorization: Bearer " . $api_key,
                "Content-Type: application/json"
            ],
            CURLOPT_POSTFIELDS => $post_data
        ]);
        $response = curl_exec($ch);
        $err = curl_error($ch);
        curl_close($ch);
        if ($err) {
            $has_error = true;
        }
    } else {
        $options = [
            'http' => [
                'method'  => 'POST',
                'header'  => "Authorization: Bearer " . $api_key . "\r\n" .
                             "Content-Type: application/json\r\n",
                'content' => $post_data,
                'timeout' => 12,
                'ignore_errors' => true
            ],
            'ssl' => [
                'verify_peer' => false,
                'verify_peer_name' => false
            ]
        ];
        $context  = stream_context_create($options);
        $response = @file_get_contents('https://api.groq.com/openai/v1/chat/completions', false, $context);
        if ($response === false) {
            $has_error = true;
        }
    }

    if ($has_error) {
        echo json_encode(['reply' => 'عذراً، أواجه صعوبة في الاتصال بالشبكة حالياً. يرجى المحاولة مرة أخرى.']);
    } else {
        $res_data = json_decode($response, true);
        if (isset($res_data['choices'][0]['message']['content'])) {
            echo json_encode(['reply' => $res_data['choices'][0]['message']['content']]);
        } else {
            echo json_encode(['reply' => 'عذراً، لم أتمكن من فهم طلبك، يرجى المحاولة مرة أخرى أو الاتصال بنا مباشرة.']);
        }
    }
    exit;
} else {
    echo json_encode(['reply' => 'طلب غير صالح.']);
    exit;
}
?>
