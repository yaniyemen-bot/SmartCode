package com.example.smartcodereader;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.Base64;
import android.view.View;
import android.widget.Button;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;

public class MainActivity extends AppCompatActivity {
    private static final int PICK_PDF_FILE = 2;
    private List<Product> products = new ArrayList<>();
    private ProductAdapter adapter;
    private GeminiService geminiService;
    private ProgressBar progressBar;
    private TextView emptyView;
    private TextView resultView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        String apiKey = "YOUR_GEMINI_API_KEY"; 
        geminiService = new GeminiService(apiKey);

        RecyclerView recyclerView = findViewById(R.id.recyclerView);
        progressBar = findViewById(R.id.progressBar);
        emptyView = findViewById(R.id.emptyView);
        resultView = findViewById(R.id.resultView);
        Button uploadButton = findViewById(R.id.uploadButton);

        adapter = new ProductAdapter(products);
        recyclerView.setLayoutManager(new LinearLayoutManager(this));
        recyclerView.setAdapter(adapter);

        uploadButton.setOnClickListener(v -> openFilePicker());
    }

    private void openFilePicker() {
        Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
        intent.setType("*/*");
        intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"application/pdf", "image/*"});
        startActivityForResult(intent, PICK_PDF_FILE);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == PICK_PDF_FILE && resultCode == RESULT_OK && data != null) {
            Uri uri = data.getData();
            readPdf(uri);
        }
    }

    private void readPdf(Uri uri) {
        try {
            progressBar.setVisibility(View.VISIBLE);
            emptyView.setVisibility(View.GONE);
            resultView.setVisibility(View.VISIBLE);
            resultView.setText("جاري معالجة الملف...");
            
            InputStream inputStream = getContentResolver().openInputStream(uri);
            byte[] bytes = new byte[inputStream.available()];
            inputStream.read(bytes);
            String base64 = Base64.encodeToString(bytes, Base64.NO_WRAP);
            String mimeType = getContentResolver().getType(uri);

            geminiService.extractCodes(base64, mimeType, new GeminiService.GeminiCallback<List<Product>>() {
                @Override
                public void onSuccess(List<Product> extracted) {
                    resultView.setText("تم استخراج " + extracted.size() + " منتجات بنجاح.");
                    products.clear();
                    products.addAll(extracted);
                    adapter.notifyDataSetChanged();
                    processBatch(extracted);
                }

                @Override
                public void onError(Exception e) {
                    progressBar.setVisibility(View.GONE);
                    resultView.setText("فشل استخراج البيانات: " + e.getMessage());
                }
            });
        } catch (Exception e) {
            resultView.setText("خطأ في قراءة الملف: " + e.getMessage());
        }
    }

    private void processBatch(List<Product> batch) {
        geminiService.standardizeBatch(batch, new GeminiService.GeminiCallback<List<Product>>() {
            @Override
            public void onSuccess(List<Product> results) {
                progressBar.setVisibility(View.GONE);
                for (Product res : results) {
                    for (Product p : products) {
                        if (p.code.equals(res.code)) {
                            p.standardizedName = res.standardizedName;
                            p.standardizedNameAr = res.standardizedNameAr;
                            p.category = res.category;
                            p.categoryAr = res.categoryAr;
                            p.confidence = res.confidence;
                            p.source = res.source;
                            p.status = "completed";
                        }
                    }
                }
                adapter.notifyDataSetChanged();
            }

            @Override
            public void onError(Exception e) {
                progressBar.setVisibility(View.GONE);
                Toast.makeText(MainActivity.this, "Standardization failed: " + e.getMessage(), Toast.LENGTH_LONG).show();
            }
        });
    }
}
