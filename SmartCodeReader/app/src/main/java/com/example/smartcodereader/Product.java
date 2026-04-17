package com.example.smartcodereader;

public class Product {
    public String id;
    public String code;
    public String originalName;
    public String standardizedName;
    public String standardizedNameAr;
    public String category;
    public String categoryAr;
    public double confidence;
    public String source;
    public String status; // pending, processing, completed, error

    public Product(String id, String code, String originalName) {
        this.id = id;
        this.code = code;
        this.originalName = originalName;
        this.status = "pending";
    }
}
