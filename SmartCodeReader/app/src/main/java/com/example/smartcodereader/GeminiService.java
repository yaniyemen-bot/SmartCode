package com.example.smartcodereader;

import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;

public class GeminiService {
    private static final String TAG = "GeminiService";
    private static final String API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=";
    private final String apiKey;
    private final OkHttpClient client;
    private final Gson gson;

    public interface GeminiCallback<T> {
        void onSuccess(T result);
        void onError(Exception e);
    }

    public GeminiService(String apiKey) {
        this.apiKey = apiKey;
        this.client = new OkHttpClient();
        this.gson = new Gson();
    }

    public void extractCodes(String base64Data, String mimeType, GeminiCallback<List<Product>> callback) {
        JsonObject payload = new JsonObject();
        JsonArray contents = new JsonArray();
        JsonObject content = new JsonObject();
        JsonArray parts = new JsonArray();

        JsonObject filePart = new JsonObject();
        JsonObject inlineData = new JsonObject();
        inlineData.addProperty("mimeType", mimeType);
        inlineData.addProperty("data", base64Data);
        filePart.add("inlineData", inlineData);
        parts.add(filePart);

        JsonObject textPart = new JsonObject();
        textPart.addProperty("text", "Extract product codes (SKUs, GTINs) and names from this document. Return as JSON array of objects with 'code' and 'originalName'.");
        parts.add(textPart);

        content.add("parts", parts);
        contents.add(content);
        payload.add("contents", contents);

        // Generation Config for JSON
        JsonObject generationConfig = new JsonObject();
        generationConfig.addProperty("responseMimeType", "application/json");
        payload.add("generationConfig", generationConfig);

        sendRequest(payload, callback, true);
    }

    public void standardizeBatch(List<Product> batch, GeminiCallback<List<Product>> callback) {
        JsonObject payload = new JsonObject();
        JsonArray contents = new JsonArray();
        JsonObject content = new JsonObject();
        JsonArray parts = new JsonArray();

        JsonArray inputItems = new JsonArray();
        for (Product p : batch) {
            JsonObject item = new JsonObject();
            item.addProperty("code", p.code);
            item.addProperty("originalName", p.originalName);
            inputItems.add(item);
        }

        JsonObject textPart = new JsonObject();
        textPart.addProperty("text", "Standardize these products. Use search if needed. " +
                "Return JSON array with code, standardizedName, standardizedNameAr, category, categoryAr, confidence, source. " +
                "Input: " + inputItems.toString());
        parts.add(textPart);

        content.add("parts", parts);
        contents.add(content);
        payload.add("contents", contents);

        JsonObject generationConfig = new JsonObject();
        generationConfig.addProperty("responseMimeType", "application/json");
        payload.add("generationConfig", generationConfig);

        sendRequest(payload, callback, false);
    }

    private void sendRequest(JsonObject payload, GeminiCallback<List<Product>> callback, boolean isExtraction) {
        RequestBody body = RequestBody.create(payload.toString(), MediaType.parse("application/json; charset=utf-8"));
        Request request = new Request.Builder()
                .url(API_URL + apiKey)
                .post(body)
                .build();

        client.newCall(request).enqueue(new Callback() {
            @Override
            public void onFailure(Call call, IOException e) {
                new Handler(Looper.getMainLooper()).post(() -> callback.onError(e));
            }

            @Override
            public void onResponse(Call call, Response response) throws IOException {
                if (!response.isSuccessful()) {
                    new Handler(Looper.getMainLooper()).post(() -> callback.onError(new Exception("API Error: " + response.code())));
                    return;
                }

                try {
                    String responseBody = response.body().string();
                    JsonObject jsonResponse = gson.fromJson(responseBody, JsonObject.class);
                    String text = jsonResponse.getAsJsonArray("candidates")
                            .get(0).getAsJsonObject()
                            .getAsJsonObject("content")
                            .getAsJsonArray("parts")
                            .get(0).getAsJsonObject()
                            .get("text").getAsString();

                    JsonArray resultsArray = gson.fromJson(text, JsonArray.class);
                    List<Product> products = new ArrayList<>();
                    for (JsonElement el : resultsArray) {
                        JsonObject obj = el.getAsJsonObject();
                        if (isExtraction) {
                            products.add(new Product(
                                    "PROD-" + System.currentTimeMillis() + "-" + products.size(),
                                    obj.get("code").getAsString(),
                                    obj.has("originalName") ? obj.get("originalName").getAsString() : ""
                            ));
                        } else {
                            Product p = new Product(obj.get("code").getAsString(), obj.get("code").getAsString(), "");
                            p.standardizedName = obj.has("standardizedName") ? obj.get("standardizedName").getAsString() : "";
                            p.standardizedNameAr = obj.has("standardizedNameAr") ? obj.get("standardizedNameAr").getAsString() : "";
                            p.category = obj.has("category") ? obj.get("category").getAsString() : "";
                            p.categoryAr = obj.has("categoryAr") ? obj.get("categoryAr").getAsString() : "";
                            p.confidence = obj.has("confidence") ? obj.get("confidence").getAsDouble() : 0.0;
                            p.source = obj.has("source") ? obj.get("source").getAsString() : "";
                            p.status = "completed";
                            products.add(p);
                        }
                    }

                    new Handler(Looper.getMainLooper()).post(() -> callback.onSuccess(products));
                } catch (Exception e) {
                    new Handler(Looper.getMainLooper()).post(() -> callback.onError(e));
                }
            }
        });
    }
}
